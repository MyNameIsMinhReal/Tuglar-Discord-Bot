# 🤖 Discord Study Bot

Bot Discord đa năng cho học sinh/sinh viên với 13 tính năng!

## ✨ Tính năng

| Lệnh | Mô tả |
|------|-------|
| `/deadline` | 📅 Nhắc deadline bài tập, lịch thi (tự nhắc 1 ngày, 3h, 30 phút trước) |
| `/docs` | 📁 Quản lý tài liệu theo môn học (Drive, PDF, link) |
| `/ask` | 🤖 Hỏi AI giải thích kiến thức, giải bài tập |
| `/quiz` | 📝 AI tự tạo câu hỏi trắc nghiệm tương tác |
| `/ai` | 🛠️ Tóm tắt chat, dịch ngôn ngữ, viết thông báo, sửa lỗi |
| `/game` | 🎮 Mini games: tung xúc xắc, kéo búa bao, đoán số, 8-ball |
| `/eco` | 💰 Hệ thống tiền ảo: daily, balance, shop, leaderboard, pay |
| `/gacha` | 🎰 Gacha nhân vật Solo Leveling (SSR/SR/R/N) |
| `/journal` | 📔 Nhật ký cá nhân riêng tư |
| `/challenge` | 🎯 Thử thách hàng ngày với streak + phần thưởng |
| Anti-spam | 🛡️ Tự động xóa spam và chặn link nguy hiểm |

## 🛠️ Cài đặt

### 1. Tạo bot Discord

1. Vào [Discord Developer Portal](https://discord.com/developers/applications)
2. Tạo **New Application** → **Bot** → **Reset Token** → copy token
3. Bật các **Privileged Gateway Intents**: `SERVER MEMBERS`, `MESSAGE CONTENT`
4. Trong **OAuth2 → URL Generator**: chọn `bot` + `applications.commands`
5. Permissions: `Send Messages`, `Read Message History`, `Manage Messages`, `Embed Links`
6. Copy URL và mời bot vào server

### 2. Lấy API Keys

- **Discord Token**: từ bước trên
- **Client ID**: trong trang application, phần **General Information**
- **Anthropic API Key**: tại [console.anthropic.com](https://console.anthropic.com)

### 3. Setup project

```bash
# Clone / giải nén project
cd discord-study-bot

# Cài dependencies
npm install

# Tạo file .env
cp .env.example .env
# Điền các giá trị vào .env

# Deploy slash commands
npm run deploy

# Chạy bot
npm run dev       # development (ts-node)
npm run build && npm start  # production
```

### 4. File .env

```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_client_id
GUILD_ID=your_server_id   # Xóa khi deploy production
ANTHROPIC_API_KEY=your_api_key
REMINDER_CHANNEL_ID=channel_id_để_gửi_nhắc  # Optional
```

## 📖 Hướng dẫn sử dụng

### 📅 Deadline
```
/deadline add title:"Bài tập Giải tích" date:"25/12/2025 23:59" subject:"Toán"
/deadline list
/deadline done id:1
/deadline delete id:1
```

### 📁 Tài liệu
```
/docs add subject:"Lập trình" title:"Slide tuần 1" url:"https://drive.google.com/..."
/docs list subject:"Lập trình"
/docs search keyword:"slide"
```

### 🤖 AI
```
/ask question:"Giải thích đạo hàm là gì?" subject:"Toán"
/quiz topic:"Cơ học Newton" count:5
/ai summary count:50
/ai translate text:"Hello world" to:vi
/ai announce topic:"Họp nhóm thứ 6" style:thân thiện
/ai fix text:"Tui đã học rất chăm chi"
```

### 💰 Economy
```
/eco daily
/eco balance
/eco leaderboard
/eco shop
/eco buy item_id:double_daily
/eco pay user:@friend amount:100
```

### 🎰 Gacha
```
/gacha roll          (100 coins)
/gacha roll10        (900 coins, 10 lần)
/gacha inventory
/gacha pool
```

### 🎮 Games
```
/game dice sides:6 count:2
/game rps
/game guess max:100
/game flip
/game 8ball question:"Mình có đậu không?"
```

### 📔 Nhật ký
```
/journal write content:"Hôm nay học được nhiều thứ hay!" mood:"😊 Vui"
/journal list
/journal read id:1
/journal search keyword:"học"
```

### 🎯 Thử thách
```
/challenge today
/challenge done
/challenge streak
/challenge leaderboard
```

## ⚙️ Cấu trúc dự án

```
src/
├── commands/      # Tất cả slash commands
├── events/        # Discord event handlers
├── services/      # Business logic (AI, Economy, Gacha, Deadline)
├── database/      # SQLite setup & schema
├── utils/         # Helpers & embed builders
└── index.ts       # Entry point
data/
├── bot.db         # SQLite database (tự tạo)
├── gacha_pool.json
├── challenges.json
└── shop_items.json
```

## 🔧 Tùy chỉnh

- **Gacha pool**: Sửa `data/gacha_pool.json` để thêm nhân vật mới
- **Thử thách**: Sửa `data/challenges.json` để thêm thử thách
- **Shop**: Sửa `data/shop_items.json` để thêm vật phẩm
- **Blocked domains**: Sửa `BLOCKED_DOMAINS` trong `events/messageCreate.ts`
- **Spam threshold**: Sửa `SPAM_THRESHOLD` và `SPAM_WINDOW_MS`

## 📌 Lưu ý

- Bot cần quyền `Manage Messages` để xóa spam
- Bot cần quyền `Read Message History` để dùng `/ai summary`
- Nhật ký là **ephemeral** (chỉ bạn thấy), dữ liệu lưu theo `user_id`
- Database tự động tạo lần đầu chạy tại `data/bot.db`
