> Archived 2026-06-24. Superseded by docs/MASTER_PLAN.md.

# UI Design System Spec

## Design Direction

Professional creator-economy SaaS for marketers, founders, and social media teams. The UI should feel polished, modern, workflow-heavy, and clear. Use DesignMD CreatorHub as the closest design reference, toned down for a premium SaaS product.

Reference:
- https://designmd.ai/chef/creatorhub

## Theme

- Background: `#FFFFFF`
- Surface: `#F9FAFB`
- Surface soft: `#F3F4F6`
- Primary text: `#111827`
- Secondary text: `#4B5563`
- Muted text: `#9CA3AF`
- Primary accent: coral `#F43F5E`
- Community/growth accent: teal `#0D9488`
- Premium accent: gold `#CA8A04`
- Success: `#16A34A`
- Warning: `#D97706`
- Error: `#DC2626`
- Info: `#2563EB`

## Typography

- Use Geist Sans for product UI.
- Use Geist Mono for IDs, logs, queue states, and technical metadata.
- Maintain tight hierarchy in dashboards: no hero-scale headings inside compact workspaces.

## Navigation

- Sidebar: Dashboard, Create, Calendar, Media, Connections, Auto Replies, Analytics, Billing, Settings.
- Top bar: workspace switcher, create button, notifications, user menu.
- Sub-bar: tabs, filters, and page-specific actions.
- Mobile: compact nav with More menu and horizontal sub-tabs.

## Page Organization

Use tabs when one page contains setup, editing, logs, analytics, or approval surfaces. Avoid turning large pages into long scrolling piles.

Required tab patterns:
- Create: Brief, Research, Drafts, Variants, Media, Schedule, Review.
- Calendar: Calendar, Queue, Published, Failed, Drafts.
- Media: Library, Uploads, AI Transforms, Platform Crops.
- Connections: Social, Messaging, Webhooks, Health.
- Auto Replies: Rules, Inbox, Approval Queue, Logs.
- Analytics: Overview, Platforms, Content, Replies, Usage.
- Billing: Plan, Usage, Invoices, Upgrade.

## UI Rules

- Use shadcn primitives but customize tokens so the app does not look default.
- Keep cards to actual repeated items, panels, modals, and tools.
- Do not nest cards inside cards.
- Use loading skeletons, empty states, and inline error states.
- Keep button text readable at all breakpoints.
- Use stable dimensions for toolbars, tabs, calendar cells, and previews.
