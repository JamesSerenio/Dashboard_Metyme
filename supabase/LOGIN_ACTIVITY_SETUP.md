# Login Activity & Devices

1. Supabase Dashboard → SQL Editor.
2. Run migrations `003`, `004`, then `005_staff_device_controls.sql` in order.
3. Restart the app, sign out, then sign in again to register the browser.
4. Open **Login Activity & Devices** in the sidebar.

Run the SQL before deploying the new frontend. It preserves accounts and business records. Device logout deletes only the selected Supabase Auth session; admin **Log out all** deletes every session for that account.
