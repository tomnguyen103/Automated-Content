import {
  BarChart3,
  Bot,
  Brain,
  CalendarDays,
  CreditCard,
  Home,
  Image,
  ListChecks,
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
  { label: "Agents", href: "/agents", icon: Bot },
  { label: "Approvals", href: "/approvals", icon: ListChecks },
  { label: "Brand Memory", href: "/brand-memory", icon: Brain },
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
  "TikTok",
  "Threads"
];

export const createTabs = ["Brief", "Research", "Drafts", "Variants", "Media", "Schedule", "Review"];
