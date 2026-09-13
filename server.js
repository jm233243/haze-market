import express from 'express';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  console.error('SUPABASE_URL 또는 SUPABASE_SECRET_KEY가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseSecretKey);

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    name: 'trade_admin_session',
    secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 6,
    },
  })
);

app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(
        new Error('JPG, PNG, WEBP, GIF 이미지만 업로드할 수 있습니다.')
      );
    }

    cb(null, true);
  },
});

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

function isAdmin(req, res, next) {
  if (!req.session?.isAdmin) {
    return res.status(401).json({
      error: '관리자 로그인이 필요합니다.',
    });
  }

  next();
}

function seller() {
  return {
    name: process.env.SELLER_NAME || '판매자 이름',
    openProfileUrl: process.env.OPEN_PROFILE_URL || '#',
  };
}

function sanitizeItem(body) {
  return {
    name: String(body.name || '').trim().slice(0, 80),

    quantity: Math.max(
      0,
      Number.parseInt(body.quantity, 10) || 0
    ),

    price: Math.max(
      0,
      Number.parseInt(body.price, 10) || 0
    ),

    image_url: String(
      body.image || body.image_url || ''
    )
      .trim()
      .slice(0, 1000),

    description: String(body.description || '')
      .trim()
      .slice(0, 500),

    details: String(body.details || '')
      .trim()
      .slice(0, 3000),

    status: String(body.status || '판매중')
      .trim()
      .slice(0, 30),
  };
}

function toFrontendItem(row) {
  return {
    id: String(row.id),
    name: row.name || '',
    quantity: row.quantity || 0,
    price: row.price || 0,
    image: row.image_url || '',
    description: row.description || '',
    details: row.details || '',
    status: row.status || '판매중',
    created_at: row.created_at,
  };
}

/* =========================
   공개 거래 페이지 API
========================= */

app.get('/api/store', async (_req, res) => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', {
      ascending: false,
    });

  if (error) {
    console.error(error);

    return res.status(500).json({
      error: '상품 정보를 불러오지 못했습니다.',
    });
  }

  res.json({
    seller: seller(),
    items: (data || []).map(toFrontendItem),
  });
});

/* =========================
   관리자 로그인
========================= */

app.post(
  '/api/admin/login',
  loginLimiter,
  (req, res) => {
    const expected = process.env.ADMIN_PASSWORD;

    if (!expected) {
      return res.status(500).json({
        error: '서버에 ADMIN_PASSWORD가 설정되지 않았습니다.',
      });
    }

    if (req.body.password !== expected) {
      return res.status(401).json({
        error: '비밀번호가 올바르지 않습니다.',
      });
    }

    req.session.isAdmin = true;

    res.json({
      ok: true,
    });
  }
);

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({
      ok: true,
    });
  });
});

app.get('/api/admin/session', (req, res) => {
  res.json({
    authenticated: Boolean(req.session?.isAdmin),
  });
});

/* =========================
   관리자 상품 목록
========================= */

app.get(
  '/api/admin/items',
  isAdmin,
  async (_req, res) => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', {
        ascending: false,
      });

    if (error) {
      console.error(error);

      return res.status(500).json({
        error: '상품 목록을 불러오지 못했습니다.',
      });
    }

    res.json({
      items: (data || []).map(toFrontendItem),
    });
  }
);

/* =========================
   이미지 업로드
========================= */

app.post(
  '/api/admin/upload',
  isAdmin,
  upload.single('image'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: '사진을 선택해주세요.',
        });
      }

      const extension =
        path.extname(req.file.originalname).toLowerCase() ||
        '.jpg';

      const fileName = `${Date.now()}-${crypto
        .randomBytes(8)
        .toString('hex')}${extension}`;

      const { error: uploadError } =
        await supabase.storage
          .from('product-images')
          .upload(fileName, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false,
          });

      if (uploadError) {
        console.error(uploadError);

        return res.status(500).json({
          error: '사진 업로드에 실패했습니다.',
        });
      }

      const { data: publicData } =
        supabase.storage
          .from('product-images')
          .getPublicUrl(fileName);

      res.status(201).json({
        url: publicData.publicUrl,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: '사진 업로드 중 오류가 발생했습니다.',
      });
    }
  }
);

/* =========================
   상품 추가
========================= */

app.post(
  '/api/admin/items',
  isAdmin,
  async (req, res) => {
    const item = sanitizeItem(req.body);

    if (!item.name) {
      return res.status(400).json({
        error: '아이템 이름을 입력해주세요.',
      });
    }

    const { data, error } = await supabase
      .from('products')
      .insert(item)
      .select()
      .single();

    if (error) {
      console.error(error);

      return res.status(500).json({
        error: '상품 등록에 실패했습니다.',
      });
    }

    res.status(201).json(
      toFrontendItem(data)
    );
  }
);

/* =========================
   상품 수정
========================= */

app.put(
  '/api/admin/items/:id',
  isAdmin,
  async (req, res) => {
    const item = sanitizeItem(req.body);

    if (!item.name) {
      return res.status(400).json({
        error: '아이템 이름을 입력해주세요.',
      });
    }

    const { data, error } = await supabase
      .from('products')
      .update(item)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      console.error(error);

      return res.status(500).json({
        error: '상품 수정에 실패했습니다.',
      });
    }

    if (!data) {
      return res.status(404).json({
        error: '아이템을 찾을 수 없습니다.',
      });
    }

    res.json(
      toFrontendItem(data)
    );
  }
);

/* =========================
   상품 삭제
========================= */

app.delete(
  '/api/admin/items/:id',
  isAdmin,
  async (req, res) => {
    const { data: currentItem } =
      await supabase
        .from('products')
        .select('image_url')
        .eq('id', req.params.id)
        .maybeSingle();

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', req.params.id);

    if (error) {
      console.error(error);

      return res.status(500).json({
        error: '상품 삭제에 실패했습니다.',
      });
    }

    if (
      currentItem?.image_url &&
      currentItem.image_url.includes(
        '/storage/v1/object/public/product-images/'
      )
    ) {
      const fileName =
        currentItem.image_url
          .split(
            '/storage/v1/object/public/product-images/'
          )[1];

      if (fileName) {
        await supabase.storage
          .from('product-images')
          .remove([fileName]);
      }
    }

    res.json({
      ok: true,
    });
  }
);

/* =========================
   관리자 페이지
========================= */

app.get('/admin', (_req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      'public',
      'admin.html'
    )
  );
});

/* =========================
   서버 시작
========================= */

app.listen(PORT, () => {
  console.log(
    `Trade board running on port ${PORT}`
  );
});
