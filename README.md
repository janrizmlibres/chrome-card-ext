# Slash Vault - Chrome Card Extension

A secure Chrome extension for managing and autofilling virtual card information with team collaboration support.

## ✨ Features

- 🔐 **Supabase Authentication** - Secure email/password authentication
- 👥 **Role-Based Access Control** - Admin and user roles with group-based card sharing
- 💳 **Virtual Card Management** - Create, view, and manage virtual cards
- 🔄 **Smart Autofill** - Intelligent card field detection and autofill
- ⏱️ **Cooldown System** - Configurable card usage cooldown periods
- 🎯 **Domain Mapping** - Map card fields for automatic detection
- 🛡️ **Row-Level Security** - Supabase RLS ensures data isolation

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ and npm
- Chrome browser
- Supabase account (free tier works)

### Installation

1. **Clone and Install**
   ```bash
   npm install
   ```

2. **Setup Supabase**
   - Follow the detailed instructions in [SETUP.md](./SETUP.md)
   - Create your Supabase project
   - Run the database schema
   - Configure environment variables

3. **Build the Extension**
   ```bash
   npm run build
   ```

4. **Start the Backend**
   ```bash
   npm run server
   ```

5. **Load in Chrome**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

## 📚 Documentation

- **[SETUP.md](./SETUP.md)** - Detailed setup and configuration guide
- **[AUTH_IMPLEMENTATION.md](./AUTH_IMPLEMENTATION.md)** - Authentication system reference
- **[PROJECT.md](./PROJECT.md)** - Original project specifications

## 🔑 Authentication

The extension uses Supabase Auth with two user roles:

### Admin Users
- Access to all cards across groups
- Can configure global settings
- Manage domain mappings
- View and manage all selector profiles

### Regular Users
- Access to cards within their group only
- Can create and use cards
- Manage their own selector profiles
- Collaborate with team members in same group

## 🎯 Usage

1. **Sign Up / Login**
   - Open the extension
   - Create an account or sign in
   - Optionally provide a group ID to join a team

2. **Create Cards**
   - Click "Generate New Card"
   - Cards are automatically added to your vault

3. **Map Card Fields**
   - Navigate to a checkout page
   - Right-click on card input fields
   - Select the field type (Card Number, Expiry, CVV)
   - Mappings are saved per domain

4. **Autofill Cards**
   - Click "Autofill Next Card" for smart selection
   - Or click "Autofill" on a specific card
   - Fields are automatically filled based on saved mappings

## 🏗️ Architecture

```
├── src/
│   ├── popup/          # Extension popup UI (React)
│   ├── background/     # Service worker for API calls
│   ├── content/        # Content script for page interaction
│   ├── lib/            # Shared utilities and types
│   └── components/     # React components
├── server/             # Express backend API
│   ├── index.ts        # Main server
│   ├── supabase.ts     # Supabase client
│   └── migrations/     # Database migrations
└── public/             # Static assets
```

## 🛠️ Development

### Available Scripts

```bash
npm run dev         # Build extension in watch mode
npm run build       # Build for production
npm run server      # Start backend server
npm run seed        # Seed database with test data
```

### Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Backend**: Express, Node.js
- **Database**: Supabase (PostgreSQL)
- **Build Tool**: Vite
- **Authentication**: Supabase Auth

## 🔒 Security

- Row-Level Security (RLS) policies enforce access control
- Anon key used in extension (safe for client-side)
- Service role key only in backend server
- Chrome storage for secure session persistence
- HTTPS required for production API

## 📝 Environment Variables

Create a `.env` file (see `.env.example`):

```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_service_role_key
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

ISC

## 🆘 Troubleshooting

### Common Issues

**Cards not showing?**
- Check your group ID matches the cards' group ID
- Verify you're logged in
- Ensure RLS policies are enabled

**Autofill not working?**
- Map the fields first (right-click on inputs)
- Check console for errors
- Verify selector profiles are saved

**Auth errors?**
- Verify Supabase credentials in `.env`
- Check Supabase project is running
- Ensure auth is enabled in Supabase dashboard

For more help, see [SETUP.md](./SETUP.md) or [AUTH_IMPLEMENTATION.md](./AUTH_IMPLEMENTATION.md)

---

Built with ❤️ using Supabase, React, and Chrome Extensions API
