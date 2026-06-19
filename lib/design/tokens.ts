import {
  BarChart3,
  CalendarDays,
  CreditCard,
  Home,
  Image,
  MessageCircleReply,
  Plug,
  Settings,
  Sparkles
} from "lucide-react";

export const brand = {
  name: "Social Media Whisperer",
  shortName: "Whisperer",
  tagline: "Research, generate, schedule, and publish without burnout."
};

export const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: Home },
  { label: "Create", href: "/create", icon: Sparkles },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "Media", href: "/media", icon: Image },
  { label: "Connections", href: "/connections", icon: Plug },
  { label: "Auto Replies", href: "/auto-replies", icon: MessageCircleReply },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Billing", href: "/billing", icon: CreditCard },
  { label: "Settings", href: "/settings", icon: Settings }
];

export const platformLabels = [
  "Instagram",
  "Facebook",
  "LinkedIn",
  "X",
  "YouTube",
  "TikTok",
  "Discord",
  "Slack"
];

export const createTabs = ["Brief", "Research", "Drafts", "Variants", "Media", "Schedule", "Review"];

export const statusCards = [
  { label: "Scheduled today", value: "7", tone: "primary" },
  { label: "Agent runs", value: "18", tone: "community" },
  { label: "Reply matches", value: "42", tone: "premium" },
  { label: "Publish health", value: "98%", tone: "success" }
];
