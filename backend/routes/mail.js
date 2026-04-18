const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const authMiddleware = require('../middleware/auth');

// Helper: create authenticated Gmail client for a user
function getGmailClient(user) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: user.accessToken,
    refresh_token: user.refreshToken
  });

  // Handle token refresh
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      user.accessToken = tokens.access_token;
      await user.save();
    }
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

// Helper: parse email headers
function parseHeaders(headers) {
  const getHeader = (name) => {
    const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return header ? header.value : '';
  };

  return {
    from: getHeader('From'),
    to: getHeader('To'),
    subject: getHeader('Subject'),
    date: getHeader('Date'),
    messageId: getHeader('Message-ID'),
    references: getHeader('References'),
    inReplyTo: getHeader('In-Reply-To')
  };
}

// Helper: decode email body
function decodeBody(payload) {
  let body = { text: '', html: '' };

  if (payload.body && payload.body.data) {
    const decoded = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    if (payload.mimeType === 'text/html') {
      body.html = decoded;
    } else {
      body.text = decoded;
    }
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        body.text = Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      if (part.mimeType === 'text/html' && part.body && part.body.data) {
        body.html = Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      // Handle nested multipart
      if (part.parts) {
        const nested = decodeBody(part);
        if (nested.text) body.text = nested.text;
        if (nested.html) body.html = nested.html;
      }
    }
  }

  return body;
}

// List emails
router.get('/list', authMiddleware, async (req, res) => {
  try {
    const gmail = getGmailClient(req.user);
    const { q = '', pageToken = '', maxResults = 20 } = req.query;

    const cacheKey = `gmail:list:${req.user._id}:${q}:${pageToken}:${maxResults}`;

    if (req.redis) {
      try {
        const cached = await req.redis.get(cacheKey);
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }
    }

    const params = {
      userId: 'me',
      maxResults: parseInt(maxResults),
      q: q || undefined
    };

    if (pageToken) {
      params.pageToken = pageToken;
    }

    const response = await gmail.users.messages.list(params);
    const messages = response.data.messages || [];
    const nextPageToken = response.data.nextPageToken || null;

    // Fetch details for each message
    const emailDetails = await Promise.all(
      messages.map(async (msg) => {
        try {
          const detail = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Subject', 'Date']
          });

          const headers = parseHeaders(detail.data.payload.headers);

          return {
            id: msg.id,
            threadId: msg.threadId,
            snippet: detail.data.snippet,
            from: headers.from,
            to: headers.to,
            subject: headers.subject,
            date: headers.date,
            labelIds: detail.data.labelIds || [],
            isUnread: (detail.data.labelIds || []).includes('UNREAD')
          };
        } catch (err) {
          console.error(`Error fetching message ${msg.id}:`, err.message);
          return null;
        }
      })
    );

    const responseData = {
      emails: emailDetails.filter(Boolean),
      nextPageToken,
      resultSizeEstimate: response.data.resultSizeEstimate
    };

    if (req.redis) {
      try {
        // Cache for 5 minutes
        await req.redis.setEx(cacheKey, 300, JSON.stringify(responseData));
      } catch (err) {
        console.error('Redis set error:', err);
      }
    }

    res.json(responseData);

  } catch (error) {
    console.error('List emails error:', error.message);
    res.status(500).json({ message: 'Failed to fetch emails.', error: error.message });
  }
});

// Get single email
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const gmail = getGmailClient(req.user);
    const msgId = req.params.id;
    const cacheKey = `gmail:msg:${req.user._id}:${msgId}`;

    if (req.redis) {
      try {
        const cached = await req.redis.get(cacheKey);
        if (cached) {
          // Fire and forget mark as read
          gmail.users.messages.modify({
            userId: 'me', id: msgId, requestBody: { removeLabelIds: ['UNREAD'] }
          }).catch(() => {});
          
          return res.json(JSON.parse(cached));
        }
      } catch (err) {
        console.error('Redis get msg error:', err);
      }
    }

    const response = await gmail.users.messages.get({
      userId: 'me',
      id: req.params.id,
      format: 'full'
    });

    const headers = parseHeaders(response.data.payload.headers);
    const body = decodeBody(response.data.payload);

    // Mark as read
    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id: req.params.id,
        requestBody: {
          removeLabelIds: ['UNREAD']
        }
      });
    } catch (e) {
      // Ignore if marking as read fails
    }

    const emailData = {
      id: response.data.id,
      threadId: response.data.threadId,
      snippet: response.data.snippet,
      headers,
      body,
      labelIds: (response.data.labelIds || []).filter(l => l !== 'UNREAD')
    };

    if (req.redis) {
      try {
        // Cache individual email for 1 day
        await req.redis.setEx(cacheKey, 86400, JSON.stringify(emailData));
        
        // Also invalidate list caches because an email was read
        const keys = await req.redis.keys(`gmail:list:${req.user._id}:*`);
        if (keys.length > 0) {
          await req.redis.del(keys);
        }
      } catch (err) {
        console.error('Redis cache/invalidate error:', err);
      }
    }

    res.json(emailData);

  } catch (error) {
    console.error('Get email error:', error.message);
    res.status(500).json({ message: 'Failed to fetch email.', error: error.message });
  }
});

// Reply to email
router.post('/reply/:id', authMiddleware, async (req, res) => {
  try {
    const gmail = getGmailClient(req.user);
    const { body: replyBody } = req.body;

    if (!replyBody) {
      return res.status(400).json({ message: 'Reply body is required.' });
    }

    // Get original message
    const original = await gmail.users.messages.get({
      userId: 'me',
      id: req.params.id,
      format: 'full'
    });

    const headers = parseHeaders(original.data.payload.headers);

    // Determine who to reply to
    const replyTo = headers.from;
    const subject = headers.subject.startsWith('Re:') ? headers.subject : `Re: ${headers.subject}`;
    const messageId = headers.messageId;
    const references = headers.references ? `${headers.references} ${messageId}` : messageId;

    // Build raw email
    const rawEmail = [
      `From: me`,
      `To: ${replyTo}`,
      `Subject: ${subject}`,
      `In-Reply-To: ${messageId}`,
      `References: ${references}`,
      `Content-Type: text/html; charset=utf-8`,
      '',
      replyBody
    ].join('\r\n');

    const encodedMessage = Buffer.from(rawEmail)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
        threadId: original.data.threadId
      }
    });

    if (req.redis) {
      try {
        // Invalidate list caches because a new email was sent
        const keys = await req.redis.keys(`gmail:list:${req.user._id}:*`);
        if (keys.length > 0) {
          await req.redis.del(keys);
        }
      } catch (err) {
        console.error('Redis invalidate error:', err);
      }
    }

    res.json({
      message: 'Reply sent successfully!',
      id: response.data.id
    });

  } catch (error) {
    console.error('Reply error:', error.message);
    res.status(500).json({ message: 'Failed to send reply.', error: error.message });
  }
});

// Send new email
router.post('/send', authMiddleware, async (req, res) => {
  try {
    const gmail = getGmailClient(req.user);
    const { to, subject, body: emailBody } = req.body;

    if (!to || !subject || !emailBody) {
      return res.status(400).json({ message: 'To, subject, and body are required.' });
    }

    const rawEmail = [
      `From: me`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: text/html; charset=utf-8`,
      '',
      emailBody
    ].join('\r\n');

    const encodedMessage = Buffer.from(rawEmail)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });

    if (req.redis) {
      try {
        // Invalidate list caches because a new email was sent
        const keys = await req.redis.keys(`gmail:list:${req.user._id}:*`);
        if (keys.length > 0) {
          await req.redis.del(keys);
        }
      } catch (err) {
        console.error('Redis invalidate error:', err);
      }
    }

    res.json({
      message: 'Email sent successfully!',
      id: response.data.id
    });

  } catch (error) {
    console.error('Send email error:', error.message);
    res.status(500).json({ message: 'Failed to send email.', error: error.message });
  }
});

module.exports = router;
