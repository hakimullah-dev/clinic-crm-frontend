# Clinic CRM Frontend

## Environment setup

Development uses [.env.development](./.env.development):

```env
VITE_API_URL=http://localhost:3001
```

Production uses [.env.production](./.env.production):

```env
VITE_API_URL=https://clinic-crm-mluimhxdg-hakimullah-devs-projects.vercel.app
```

Replace the production URL with your real backend before deploying, or set the same value in Vercel:

```env
VITE_API_URL=https://clinic-crm-mluimhxdg-hakimullah-devs-projects.vercel.app
```

## Commands

```bash
npm install
npm run dev
npm run build
```
