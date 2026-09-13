import express from 'express';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import multer from 'multer';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
await fs.mkdir(UPLOAD_DIR, { recursive: true });
const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: 'trade_admin_session',
  secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 6
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.mimetype)) return cb(new Error('JPG, PNG, WEBP, GIF 이미지만 업로드할 수 있습니다.'));
    cb(null, true);
  }
});

const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

async function readData() {
  return JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
}
async function writeData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}
function isAdmin(req, res, next) {
  if (!req.session?.isAdmin) return res.status(401).json({ error: '관리자 로그인이 필요합니다.' });
  next();
}
function seller() {
  return {
    name: process.env.SELLER_NAME || '판매자 이름',
    openProfileUrl: process.env.OPEN_PROFILE_URL || '#'
  };
}
function sanitizeItem(body, current = {}) {
  return {
    id: current.id || crypto.randomUUID(),
    name: String(body.name || '').trim().slice(0, 80),
    quantity: Math.max(0, Number.parseInt(body.quantity, 10) || 0),
    price: Math.max(0, Number.parseInt(body.price, 10) || 0),
    image: String(body.image || '').trim().slice(0, 500),
    description: String(body.description || '').trim().slice(0, 160),
    details: String(body.details || '').trim().slice(0, 1200)
  };
}

app.get('/api/store', async (_req, res) => {
  const data = await readData();
  res.json({ seller: seller(), items: data.items || [] });
});

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return res.status(500).json({ error: '서버에 ADMIN_PASSWORD가 설정되지 않았습니다.' });
  if (req.body.password !== expected) return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  req.session.isAdmin = true;
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admin/session', (req, res) => res.json({ authenticated: Boolean(req.session?.isAdmin) }));
app.get('/api/admin/items', isAdmin, async (_req, res) => res.json(await readData()));

app.post('/api/admin/upload', isAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '사진을 선택해주세요.' });
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
});

app.post('/api/admin/items', isAdmin, async (req, res) => {
  const data = await readData();
  const item = sanitizeItem(req.body);
  if (!item.name) return res.status(400).json({ error: '아이템 이름을 입력해주세요.' });
  data.items = [item, ...(data.items || [])];
  await writeData(data);
  res.status(201).json(item);
});

app.put('/api/admin/items/:id', isAdmin, async (req, res) => {
  const data = await readData();
  const index = (data.items || []).findIndex(i => i.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: '아이템을 찾을 수 없습니다.' });
  data.items[index] = sanitizeItem(req.body, data.items[index]);
  await writeData(data);
  res.json(data.items[index]);
});

app.delete('/api/admin/items/:id', isAdmin, async (req, res) => {
  const data = await readData();
  const before = data.items.length;
  data.items = data.items.filter(i => i.id !== req.params.id);
  if (before === data.items.length) return res.status(404).json({ error: '아이템을 찾을 수 없습니다.' });
  await writeData(data);
  res.json({ ok: true });
});

app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.listen(PORT, () => console.log(`Trade board running on http://localhost:${PORT}`));
