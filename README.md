# 🤖 Food Delivery Order Management Bot (Backend)

The serverless backend logic for the Single-Restaurant Food Delivery Ecosystem. Built with **Node.js**, **Telegraf.js**, and **Supabase**.

## 🏗️ Features
- **Telegram Bot Integration**: Receives commands from the restaurant administrator.
- **Real-time Notifications**: Triggered by Supabase webhooks when new orders are placed.
- **Status Management**: Inline keyboard buttons to update order status (`Cooking`, `On the Way`, `Delivered`).
- **Payment Verification**: Receives and displays payment proof screenshots sent from the mobile app.

## 🚀 Deployment (Vercel)

This backend is designed to run as **Serverless Functions** on Vercel.

### 1. Environment Variables
Configure the following in your Vercel project settings:
- `TELEGRAM_BOT_TOKEN`: Your bot token from @BotFather.
- `TELEGRAM_ADMIN_ID`: Your personal Telegram ID.
- `SUPABASE_URL`: Your Supabase Project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for admin access to the database.

### 2. Set Webhooks
After deploying to Vercel, you must set the webhooks:

#### Telegram Webhook
```sh
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<YOUR_APP>.vercel.app/"
```

#### Supabase Webhook
Configure a Database Webhook in the Supabase Dashboard:
- **Events**: `INSERT` on `orders` table.
- **URL**: `https://<YOUR_APP>.vercel.app/api`
- **Method**: `POST`

## 🛠️ Tech Stack
- **Runtime**: Node.js
- **Bot Framework**: [Telegraf](https://telegraf.js.org/)
- **Database Client**: [@supabase/supabase-js](https://supabase.com/docs/reference/javascript/introduction)
- **Deployment**: [Vercel](https://vercel.com/)

---
*Maintained by लीड Lead Architect.*
