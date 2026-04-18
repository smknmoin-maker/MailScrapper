# 📧 MailScrapper

MailScrapper is a premium, full-stack web application that allows users to access, search, read, and reply to their Gmail messages from a beautiful, unified dashboard. It features secure Google OAuth 2.0 authentication combined with an extra layer of security via OTP verification sent to your email.

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)

---

## ✨ Features

- **Google OAuth 2.0 Integration**: Secure login using Google accounts.
- **Two-Factor Authentication (OTP)**: Automatic 6-digit OTP sent via Nodemailer for extra security.
- **Gmail API Integration**: View inbox, sent mails, drafts, starred, and spam folders.
- **Email Interactions**: Read full HTML emails, reply to threads, and compose new emails directly from the dashboard.
- **Search Functionality**: Quickly search through your emails using Gmail's search syntax.
- **Premium UI/UX**: Stunning dark-mode interface with glassmorphism, smooth animations, and responsive design.
- **High Performance Caching**: Fast data retrieval and indexing powered by Redis.

---

## 🛠️ Tech Stack

### Frontend
- React.js (Vite)
- React Router DOM (Navigation)
- Axios (API requests)
- Vanilla CSS (Custom Design System, CSS Variables, Animations)

### Backend
- Node.js & Express.js
- MongoDB & Mongoose (Database & ODM)
- Googleapis (Gmail API wrapper)
- Nodemailer (OTP email delivery)
- JSON Web Tokens (JWT Session Management)
- Redis (Data caching and indexing)

---

## 🚀 Local Development Setup

### 1. Prerequisites
Before running the application, you need to set up the following credentials:

1. **MongoDB Connection String**: Create a cluster on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. **Google Cloud Console**:
   - Create a project and enable the **Gmail API**.
   - Create **OAuth 2.0 Client IDs** (Web application).
   - Add `http://localhost:5174` to **Authorized JavaScript origins**.
   - Add `http://localhost:5000/api/auth/google/callback` to **Authorized redirect URIs**.
3. **Gmail App Password**: Go to your Google Account Security settings, enable 2FA, and generate an App Password for Nodemailer.
4. **Redis Database**: Create a serverless Redis database on [Upstash](https://upstash.com/) for caching and indexing.

### 2. Clone the Repository
```bash
git clone https://github.com/smknmoin-maker/MailScrapper.git
cd MailScrapper
```

### 3. Backend Setup
```bash
cd backend
npm install
```

Create a `.env` file in the `backend` directory:
```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback
JWT_SECRET=your_super_secret_jwt_key
EMAIL_USER=your_gmail_address@gmail.com
EMAIL_PASS=your_16_character_app_password
FRONTEND_URL=http://localhost:5174
REDIS_URI=your_redis_connection_string
```

Start the backend server:
```bash
npm run dev
```

### 4. Frontend Setup
Open a new terminal window:
```bash
cd frontend
npm install
```

Ensure the `API` constant in `frontend/src/pages/Login.jsx`, `OTPVerification.jsx`, and `Dashboard.jsx` is set to `http://localhost:5000/api` for local development.

Start the frontend development server:
```bash
npm run dev
```

---

## 🌍 Deployment

### Backend (Render)
1. Create a new Web Service on [Render](https://render.com/).
2. Connect your GitHub repository.
3. Set the Root Directory to `backend`.
4. Build Command: `npm install`
5. Start Command: `node server.js`
6. Add all environment variables from your `.env` file. Update `FRONTEND_URL` to your live frontend URL, and ensure `REDIS_URI` is added.

### Frontend (Vercel)
1. Create a new Project on [Vercel](https://vercel.com/).
2. Import the repository and set the Root Directory to `frontend`.
3. Vercel will automatically detect the Vite framework.
4. Deploy the project.
5. **Important**: Update the `API` variables in your React components to point to your live Render backend URL, and ensure `vercel.json` is present for React Router to handle page refreshes correctly.

### Post-Deployment
Remember to update your **Google Cloud Console OAuth settings** to include your live Vercel URL in Origins and your live Render URL in Redirect URIs!

---

## 📜 License

This project is open-source and available under the MIT License.
