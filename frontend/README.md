# Trader Frontend

React frontend for the trading journal app, built with Tailwind CSS and Recharts.

## Stack

- React with hooks
- Tailwind CSS
- Recharts
- Axios
- React Router

## Project Structure

```text
frontend/
  src/
    components/
      ui/
      AnalyticsCharts.jsx
      Filters.jsx
      ProtectedRoute.jsx
      AdminRoute.jsx
      TradeForm.jsx
      TradeTable.jsx
      UploadCSV.jsx
    context/
      AuthContext.jsx
    layouts/
      AppShell.jsx
    pages/
      AdminPage.jsx
      DashboardPage.jsx
      LoginPage.jsx
      RegisterPage.jsx
      TradesPage.jsx
    services/
      api.js
      authService.js
      tradeService.js
    utils/
      analytics.js
      formatters.js
    App.jsx
    index.css
    main.jsx
  .env.example
  index.html
  package.json
  postcss.config.js
  tailwind.config.js
  vite.config.js
```

## Setup

1. Make sure the backend API is running.
2. Create the frontend env file:

```bash
cp .env.example .env
```

3. Set the API URL if needed:

```env
VITE_API_URL=http://localhost:5000/api
```

4. Install dependencies:

```bash
npm install
```

5. Start the frontend:

```bash
npm run dev
```

By default, Vite will serve the app at [http://localhost:5173](http://localhost:5173).

## Notes

- Dashboard analytics are derived client-side from the fetched trades.
- The admin page is structured for future admin APIs; with the current backend it can only display trade data available to the authenticated admin user.
