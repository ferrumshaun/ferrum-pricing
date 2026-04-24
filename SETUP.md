# FerrumIT Pricing Platform — Setup Guide

## Step 1: Run the Database Migration

1. Go to https://supabase.com/dashboard/project/aofkooanmwappqwfdffu
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**
4. Open the file `supabase_migration.sql` from this folder, copy ALL of it, paste it in
5. Click **Run** (green button)
6. You should see "Success. No rows returned" — that means it worked

## Step 2: Create Your Admin Users in Supabase

1. Go to **Authentication → Users** in your Supabase dashboard
2. Click **Invite User**
3. Invite: shaun@ferrumit.com, betsy@ferrumit.com, saulo@ferrumit.com (use actual emails)
4. They'll each get an email to set a password
5. Then go to **SQL Editor** and run this for each admin user (replace the email):

```sql
UPDATE public.profiles 
SET role = 'admin', full_name = 'Shaun'
WHERE email = 'shaun@ferrumit.com';
```

## Step 3: Push Code to GitHub

Open Terminal on your Mac (Applications → Utilities → Terminal) and paste these commands one at a time:

```bash
cd ~/Downloads
# (or wherever you save files — navigate to the ferrum-pricing folder)

git init
git add .
git commit -m "Initial commit — FerrumIT Pricing Platform"
git branch -M main
git remote add origin https://github.com/ferrumshaun/ferrum-pricing.git
git push -u origin main
```

If it asks for a password, use a GitHub Personal Access Token:
- GitHub → Settings → Developer Settings → Personal Access Tokens → Generate new token
- Give it "repo" scope → copy the token → use it as your password

## Step 4: Connect Netlify to GitHub

1. Go to https://app.netlify.com
2. Click **Add new site → Import an existing project**
3. Connect to GitHub → select **ferrumshaun/ferrum-pricing**
4. Build settings should auto-detect (build command: `npm run build`, publish: `build`)
5. **Before deploying**, go to **Site settings → Environment variables** and add:
   - `REACT_APP_SUPABASE_URL` = `https://aofkooanmwappqwfdffu.supabase.co`
   - `REACT_APP_SUPABASE_ANON_KEY` = your anon key (eyJ...)
6. Click **Deploy site**

## Step 5: Add HubSpot Token (when ready)

In Netlify → Site settings → Environment variables, add:
- `REACT_APP_HUBSPOT_TOKEN` = your HubSpot private app token

Never commit this to GitHub — environment variables in Netlify are safe.

## How Updates Work Going Forward

When we make code changes:
1. I provide updated files
2. You replace the files in your ferrum-pricing folder
3. Run: `git add . && git commit -m "Update: description" && git push`
4. Netlify auto-deploys in ~60 seconds

## Your Platform URLs (once deployed)

- App: your-site-name.netlify.app (you can add a custom domain later)
- Admin panel: /admin (Shaun, Betsy, Saulo only)
- Activity log: /activity (admins only)
- New quote: / (all users)
- Saved quotes: /quotes (all users)
