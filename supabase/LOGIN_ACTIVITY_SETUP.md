# Login Activity & Devices

1. Supabase Dashboard → SQL Editor.
2. Copy and run `migrations/202610280003_login_activity_devices.sql` once.
3. Restart the app, sign out, then sign in again to register the browser.
4. Open **Login Activity & Devices** in the sidebar.

Run the SQL before deploying the new frontend. It preserves accounts and business records. Device logout deletes only the selected Supabase Auth session; admin **Log out all** deletes every session for that account.
