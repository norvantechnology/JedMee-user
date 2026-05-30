# JedMee Mobile

Flutter mobile application with feature parity to the JedMee web user app (`frontend/`).

## Theme

Colors match `frontend/src/styles/theme.css` (indigo primary `#4F46E5`, slate surfaces, semantic success/danger/warning, dark sidebar `#17223d`).

## API (local)

Default: **`http://localhost:4000`** (same as `frontend/.env` `VITE_API_BASE_URL`).

| Platform | URL |
|----------|-----|
| Web / iOS simulator / desktop | `http://localhost:4000` |
| Android emulator | `http://10.0.2.2:4000` |

Start the backend first:

```bash
cd backend
npm run dev
```

Override API URL:

```bash
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:4000
```

## Run

```bash
cd mobile
flutter pub get
flutter run -d chrome --web-port=8080
```

**USB Android phone** (sets Java/SDK paths and checks adb):

```bash
./flutter_run.sh
```

Open **http://localhost:8080** in your browser (Chrome is used automatically with `flutter run -d chrome`).

Ensure the API backend is running on port 4000 (`frontend/.env.example` uses `http://localhost:4000`).

## Tests

```bash
flutter test
flutter analyze
```

## Features

All authenticated web routes are implemented:

- Auth (login, register, OTP, forgot/change password, approval gate)
- Dashboard with KPIs and charts
- Master setup (products/batches, manufacturers, divisions, suppliers, customers, catalog)
- Transactions (sales billing, returns, purchases, orders, prescriptions)
- Payments (customer, division/supplier)
- Reports (inventory tabs, day book, GST R1/R2/3B, ledger, sales & stock analysis)
- User management (users, roles & access)
- Profile settings

Permission-gated navigation mirrors `userSidebarNav.js` and retailer vs wholesaler roles.
