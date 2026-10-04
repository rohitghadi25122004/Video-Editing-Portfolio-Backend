# Portfolio backend

Express API and admin panel for the portfolio site in `../frontend`.

- `GET /api/content`: the public video list. The site loads it in the browser when a page opens.
- `/admin/`: password-protected panel to add, edit, reorder and delete videos.
- Media goes from the admin browser straight to storage through one-time signed uploads. Large videos never pass through this server.
- Storage: `local` (development), `cloudinary`, or `s3` (any S3-compatible bucket).

## Run locally

```bash
npm install
cp .env.example .env    # then fill ADMIN_PASSWORD_HASH and SESSION_SECRET
npm run hash-password   # prints ADMIN_PASSWORD_HASH=...
npm run seed            # imports ../frontend/content/vasant.json
npm run dev             # http://localhost:4000/admin/
```

In `../frontend/.env.local`, set `NEXT_PUBLIC_API_URL=http://localhost:4000` so the site reads this list.

With `STORAGE_DRIVER=local`, content and uploads go to `./data/` (gitignored). Use this for development only: most hosts wipe the disk on every deploy.

## Deploy

Any Node 22+ host works, such as Render, Railway, Fly.io or a VPS.

- Build: `npm install && npm run build`
- Start: `npm start`
- Environment: everything in `.env.example`, plus:
  - `NODE_ENV=production`
  - `STORAGE_DRIVER=cloudinary` or `s3`
  - `PUBLIC_BASE_URL`: this server's https URL
  - `SITE_ORIGINS`: the site's https URL

Then on the frontend host, set `NEXT_PUBLIC_API_URL` to this server's URL and rebuild once.

### Cloudinary

1. In the Cloudinary console, open **Settings > API Keys** and copy the **API environment variable** (`cloudinary://...`). Put it in `CLOUDINARY_URL`, and set `STORAGE_DRIVER=cloudinary`.
2. Run `npm run seed` once, so the current site list is stored in Cloudinary.
3. Restart the backend.

No CORS or bucket settings are needed. Uploads are signed by this server and go straight from the admin browser to Cloudinary.

What gets stored, under `CLOUDINARY_FOLDER` (default `portfolio`):

- `videos/`: the MP4s, played as uploaded.
- `covers/`: delivered as `f_auto,q_auto` (AVIF or WebP, automatic quality), at most 1600px wide.
- `content/items.json`: the video list, a raw asset. Each save overwrites it.

Free-plan upload limits are about 100 MB per video and 10 MB per image. Upload web copies, not masters.

### S3-compatible bucket (example: Cloudflare R2)

1. Create a bucket and turn on public access, either the r2.dev URL or a custom domain. That URL is `S3_PUBLIC_URL`.
2. Create an API token with Object Read & Write on the bucket. Its values are `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`. `S3_ENDPOINT` is `https://<account-id>.r2.cloudflarestorage.com` and `S3_REGION` is `auto`.
3. Add a CORS policy to the bucket. Uploads come from the admin panel's origin. The site's WebGL globe reads covers, so they must be readable from any origin:

```json
[
  { "AllowedOrigins": ["https://<backend-host>"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 3600 },
  { "AllowedOrigins": ["*"], "AllowedMethods": ["GET", "HEAD"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 86400 }
]
```

AWS S3, Backblaze B2 and DigitalOcean Spaces work the same way: set their endpoint and region, and apply the same CORS rules.

## Data model

Items mirror `PortfolioItem` in `frontend/src/lib/content.ts`, and the schema lives in `src/schema.ts`. Change both together.

The server applies these rules:

- `aspect` follows `format`: shorts are 9:16 and long-form is 16:9.
- Only one item can be the hero pick (`approved`).
- Em and en dashes in text become hyphens.
- Deleting an item, or replacing its media, removes the uploaded files no other item uses.
- Seeded `/media/...` files belong to the site and are never touched.
