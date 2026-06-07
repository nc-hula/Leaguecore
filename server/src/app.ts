import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool } from './db';
import passport from './auth/passport';
import authRouter from './auth/router';
import apiRouter from './api/router';
import { startScheduler } from './scheduler';

const app = express();

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session store backed by PostgreSQL
const PgSession = connectPgSimple(session);

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET ?? 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    },
  })
);

// Passport authentication middleware
app.use(passport.initialize());
app.use(passport.session());

// Routers
app.use('/auth', authRouter);
app.use('/api', apiRouter);

// CSP headers — allow Spotify and YouTube iframes, restrict everything else
app.use((_req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://i.ytimg.com https://i.scdn.co https://mosaic.scdn.co",
      "frame-src https://open.spotify.com https://www.youtube.com https://youtube.com",
      "connect-src 'self'",
    ].join('; ')
  );
  next();
});

// Start rigid-mode deadline scheduler
if (process.env.NODE_ENV !== 'test') {
  startScheduler(pool);
}

export default app;
