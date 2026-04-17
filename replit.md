# GridMart - Local Pickup Marketplace

## Overview
GridMart is a local pickup marketplace connecting buyers with community fulfillment locations called "Nodes." It enables users to shop online and pick up products locally, eliminating shipping delays. The platform serves buyers, node partners, and administrators. The business vision is to revolutionize local commerce by providing a convenient, community-focused alternative to traditional shipping, fostering local economies, and enhancing consumer convenience.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React with TypeScript, using Vite.
- **Routing**: Wouter.
- **State Management**: Zustand for global auth, TanStack React Query for server state, and local React state with localStorage for cart/orders.
- **UI Components**: shadcn/ui with Radix UI primitives and Tailwind CSS v4.
- **Key Features**: Product browsing, cart/checkout, Node discovery, Node & Admin Dashboards, login, and node application forms.

### Backend
- **Framework**: Express.js with TypeScript.
- **API Design**: RESTful endpoints.
- **Authentication**: Session-based using `express-session` with PostgreSQL storage and bcrypt for password hashing.
- **Key Functionality**: Authentication, product/template/batch management, duplicate detection, node management, order lifecycle, inventory, and node applications.

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM.
- **Schema Design**: Unified `users` table, `product_templates` (canonical listings), `inventory_batches` (individual inventory with sheet row references), `duplicate_queue`, `nodes`, `orders`, `nodeAvailability`, and `nodeApplications`.
- **Migrations**: Drizzle Kit.

### Build System
- **Development**: Vite for frontend (HMR), `tsx` for server.
- **Production**: Vite builds frontend to `dist/public`, `esbuild` bundles server to `dist/index.cjs`. Single `npm start` command.

### Performance Optimizations
- **Code Splitting**: All routes use `React.lazy()` with `Suspense` — only the Home page is eagerly loaded; all other pages are loaded on-demand.
- **Chunk Splitting**: Vite `manualChunks` separates `react`, `radix-ui`, `recharts`, `stripe`, and `react-query` into separate cached bundles.
- **Gzip Compression**: Express `compression` middleware compresses all responses.
- **Static Asset Caching**: Hashed JS/CSS files served with `max-age=1y, immutable`; HTML files served with `no-cache`.
- **Image Optimization**: On-the-fly WebP conversion via `sharp` with long-term caching in object storage.
- **SEO URLs**: Product pages use slug-based URLs (`/product/product-name-shortid`) with 301 redirects from old UUID URLs and server-injected OpenGraph meta tags.

### Core Features & Design Decisions
- **Gift Promo Codes**: Supports percentage, fixed, free gift, and gift choice discount types with specific database fields and admin/checkout integration.
- **Phone-Based Signup & SMS Verification**: Allows user registration/login via phone number with Twilio SMS verification, rate limiting, and consistent phone normalization.
- **Customizable Tiered Handoff Fees**: Nodes can configure tiered pricing, and individual products can have custom fee overrides.
- **48-Hour Guaranteed Pickup Slots**: Checkout displays only guaranteed pickup windows generated from node availability for the next 48 hours.
- **Two-Tier Catalog System**: `Product Templates` (canonical listings) and `Inventory Batches` (individual inventory entries) linked manually.
- **Batch vs Variant Product Relationships**: Products can be linked as `batch` (quantity absorbed by parent, not individually selectable) or `variant` (retains own quantity, individually selectable).
- **Multi-Role Support**: Node hosts can use the same account for shopping with a role switcher.
- **Enhanced Batch Product Import**: Comprehensive manual product field editing (title, description, price, category, condition, color, images, initial stock).
- **Recruitment Dropout Tracking**: Anonymous survey system for node host applicants with admin dashboard viewing.
- **SMS Notifications**: Twilio integrated for order updates (Node: "READY" reply, Customer: "pickup ready") and node inventory alerts.
- **Product Import from URL**: Scrapes product details from URLs, uses AI for content rewriting, and allows review before saving.
- **Product Labels**: Generates labels for Dymo LabelWriter 450 with product code, name, and branding.
- **Stripe Payment Integration**: Full Stripe checkout flow with webhook handling for payment confirmation and inventory decrement.
- **Wishlist/Favorites**: Buyers can save products to a persistent wishlist.
- **Low Stock Alerts & Analytics**: Admin dashboard features for low-stock alerts and inventory analytics.
- **Legal & Support Pages**: Contact Us, Privacy Policy, and Terms of Service pages.
- **Host Payments Tracking**: Admin "Payments" tab for manually logging payments made to node hosts (e.g., e-transfer, cash, cheque). Tracks amount, method, date, period, and memo with summary cards and per-host totals. Supports CRUD operations with Zod validation.
- **Node Coupon Distribution**: Admin assigns promo codes to specific node hosts who see them in their dashboard's Coupons tab and can share with friends/family via copy-to-clipboard. Supports batch generation of unique single-use codes (linked via `batchId`), "given out" checkbox for hosts to track distribution, and host abuse prevention (hosts cannot redeem their own assigned codes).
- **Order Notification Queueing**: When an order is placed outside a node's availability window, the host SMS notification is queued and held until the node's next availability window opens. Queue processor runs every 60 seconds checking `nodeAvailability` schedule. Admin SMS tab shows real-time queue status (queued with estimated send time, recently sent with timestamps). Uses `hostNotificationQueued` and `hostNotifiedAt` fields on orders. Logic in `server/services/orderQueue.ts`, webhook decision in `server/webhookHandlers.ts`.
- **Storefront Layout Customization**: Admin-controlled product grid layout stored in `site_settings` (key: `storefrontLayout`). Controls: responsive column counts (desktop/tablet/mobile), card size/gap, image aspect ratio & fit, content visibility toggles (name, price, description, condition, brand, product code), typography (font sizes, price color/weight), card styling (radius, shadow, background), hover effects (none/lift/scale/border/glow), custom heading & subheading with alignment/color/size/weight, category & subcategory heading customization, and default sort order. Live preview in admin. Applied via injected CSS grid and layout props in `ProductCard`.
- **Crate Map**: Visual 2x3 grid layout editor for mapping physical crate sections to inventory items. Supports: removable dividers (horizontal/vertical) to merge sections, items on divider lines (straddling sections), landscape/portrait orientation, product search to assign items, print with title/date/subtext, default subtext persisted to localStorage. Map data stored as JSON in `crates.mapData`. Component: `client/src/components/crate/CrateMap.tsx`, API: `PUT /api/crates/:id/map`. Opening a crate shows a full-screen tabbed view with "List" (default) and "Crate Map" tabs. List tab allows searching/adding/removing items with quantity controls. Map tab shows the visual grid editor. Items sync bidirectionally — saving in the map tab updates the list view, and list items are passed as crate items to the map.
- **About Us Page**: Editable from admin Design & Layout, stored in `site_settings` key `aboutUsText`. Linked in footer Quick Links.
- **Thank You Page**: Fixed `/thank-you` conversion page for Google Ads tracking. Checkout redirects here after Stripe payment, then auto-redirects to order details after 3 seconds.
- **Product Landing Pages**: Supports five modes — `single` (one hero product with image + details), `multi` (multiple equal hero products in a responsive grid), `location` (all products at a specific node), `product-location` (specific products + specific node with pre-selected checkout), and `postal-code` (visitor enters postal code, nearest node found via server-side Google Geocoding API, products at that node displayed). Postal-code mode uses `POST /api/nearest-node` endpoint which geocodes the postal code, calculates Haversine distance to all active nodes, and returns the nearest node with its products. Product-location mode shows selected products as hero cards, displays the node info, and sends the buyer straight to checkout with the node pre-selected. Includes customizable "Shop More" text and link fields (`shopMoreText`, `shopMoreLink`). Schema fields: `mode` (single/multi/location/product-location/postal-code), `productIds` (text array), `nodeId`, `shopMoreText`, `shopMoreLink`. Admin Landing Pages tab has mode selector with conditional fields per mode.
- **Availability Edit History**: Tracks all calendar/schedule changes made by admins and node hosts. Stored in `availability_edit_history` table with `editType` (schedule/override), `editedBy`, `editedByName`, `previousValue`, `newValue`, and `summary`. Logged automatically when weekly schedule or date overrides are saved. Viewable in admin node settings under "Calendar Edit History" section, showing last 50 entries with expandable list.
- **Flyer Distribution Tool**: Admin "Flyers" tab with interactive Google Map for planning flyer distribution. Click or search to set a center point, adjust inner/outer radius sliders to create a donut zone, then fetch real addresses from OpenStreetMap (Overpass API) within that zone. Displays address list with distance badges, copy-all and CSV download. Component: `client/src/components/admin/FlyerDistribution.tsx`.
- **Landing Page Text Block**: Rich text section (`textbox`) that can be added to any landing page layout. Features a contentEditable WYSIWYG editor with toolbar (bold, italic, underline, font size, lists, alignment, links, image upload, text color). Content stored as HTML in `textboxContent` column on `landing_pages`. Has its own dedicated "Text Block" tab in the editor. Renders on the public landing page when included in layoutOrder.
- **Landing Page Category Ordering**: Product categories on landing pages follow the same sort order as the homepage (via `/api/categories` sortOrder), not alphabetical.
- **Postal Code Dual Layouts**: Postal code search landing pages support separate layout sections for pre-search (shown before visitor searches) and post-search (shown after location is found). Uses `postSearchLayoutOrder` column on `landing_pages`. If post-search layout is empty, falls back to pre-search layout. Editor shows color-coded Pre-Search (blue) and Post-Search (green) layout sections in the Layout tab for postal-code mode.

### UI/UX & Branding
- **Color Scheme**: Primary Teal (HSL 171 76% 41%), Accent Navy (#1D3557).
- **Logo**: Shopping bag with location pin icon.

## External Dependencies

- **Database**: PostgreSQL
- **Session Storage**: PostgreSQL via `connect-pg-simple`
- **Maps**: Google Maps JavaScript API (via `VITE_GOOGLE_MAPS_API_KEY`) for all map rendering, address autocomplete, and geocoding. Centralized loader in `client/src/lib/googleMaps.ts`.
- **UI Libraries**: Radix UI, Tailwind CSS v4, Lucide (icons)
- **Development Tools**: Replit-specific plugins, custom Vite plugin for OpenGraph.
- **Key NPM Packages**:
    - `drizzle-orm`, `drizzle-zod`
    - `express-session`
    - `bcrypt`
    - `zod`
    - `wouter`
    - `zustand`
    - `cheerio` (for HTML parsing)
    - `openai` (via Replit AI Integrations for content rewriting)
    - `twilio` (for SMS notifications)