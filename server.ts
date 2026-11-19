import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import axios from 'axios';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import admin from 'firebase-admin';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase Config
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf8'));

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const db = admin.firestore(firebaseConfig.firestoreDatabaseId);

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ticketing-system-secret-key';

app.use(express.json());
app.use(cookieParser());

// Microsoft OAuth Config
const MS_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MS_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const MS_TENANT_ID = process.env.MICROSOFT_TENANT_ID || 'common';
const REDIRECT_URI = `${process.env.APP_URL}/auth/callback`;

// Auth Middleware
const authenticate = async (req: any, res: any, next: any) => {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// API Routes
app.get('/api/auth/url', (req, res) => {
  if (!MS_CLIENT_ID) {
    return res.status(500).json({ error: 'Microsoft Client ID not configured' });
  }

  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    response_mode: 'query',
    scope: 'openid profile email User.Read',
    state: '12345',
  });

  const authUrl = `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`;
  res.json({ url: authUrl });
});

app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
  const { code } = req.query;

  if (!code) return res.status(400).send('Code missing');

  try {
    // 1. Exchange code for token
    const tokenResponse = await axios.post(
      `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: MS_CLIENT_ID!,
        client_secret: MS_CLIENT_SECRET!,
        code: code as string,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token } = tokenResponse.data;

    // 2. Get user info from Microsoft Graph
    const userResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const msUser = userResponse.data;
    const uid = msUser.id;
    const email = msUser.mail || msUser.userPrincipalName;
    const name = msUser.displayName;
    const department = msUser.officeLocation || 'IT'; // Placeholder or actual if available

    // 3. Store/Update user in Firestore
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();

    let role = 'user';
    if (userDoc.exists) {
      role = userDoc.data()?.role || 'user';
    } else {
      // First user could be admin? Or check email
      if (email === 'muhammadasadkpr@gmail.com') role = 'admin';
    }

    const userData = {
      uid,
      name,
      email,
      department,
      role,
      updatedAt: new Date().toISOString(),
    };

    await userRef.set(userData, { merge: true });

    // 4. Create JWT
    const token = jwt.sign({ uid, name, email, role, department }, JWT_SECRET, { expiresIn: '7d' });

    // 5. Set Cookie
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // 6. Return success script
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error('OAuth Error:', error.response?.data || error.message);
    res.status(500).send('Authentication failed');
  }
});

app.get('/api/me', authenticate, (req: any, res) => {
  res.json(req.user);
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
  });
  res.json({ success: true });
});

// Vite middleware for development
if (process.env.NODE_ENV !== 'production') {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
