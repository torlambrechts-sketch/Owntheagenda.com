import {
  Sprout,
  Leaf,
  TreePine,
  Trees,
  Flower2,
  Mountain,
  Flag,
  ClipboardCheck,
  ClipboardList,
  UsersRound,
  Users,
  Presentation,
  CheckCheck,
  Repeat,
  Flame,
  TrendingUp,
  Sparkles,
  ShieldCheck,
  Layers,
  GitMerge,
  CircleDot,
  Send,
  Lock,
  Plus,
  ArrowRight,
  Check,
  LayoutGrid,
  BarChart3,
  Target,
  Calendar,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";

// Resolves the kebab-case lucide icon names stored in the database
// (journey_level.icon, milestone.icon, onboarding_framework.icon) to real
// components, with a safe fallback. Keep this map in sync with the seeds.
const MAP: Record<string, LucideIcon> = {
  sprout: Sprout,
  leaf: Leaf,
  "tree-pine": TreePine,
  trees: Trees,
  "flower-2": Flower2,
  mountain: Mountain,
  flag: Flag,
  "clipboard-check": ClipboardCheck,
  "clipboard-list": ClipboardList,
  "users-round": UsersRound,
  users: Users,
  presentation: Presentation,
  "check-check": CheckCheck,
  repeat: Repeat,
  flame: Flame,
  "trending-up": TrendingUp,
  sparkles: Sparkles,
  "shield-check": ShieldCheck,
  layers: Layers,
  "git-merge": GitMerge,
  "circle-dot": CircleDot,
  send: Send,
  lock: Lock,
  plus: Plus,
  "arrow-right": ArrowRight,
  check: Check,
  "layout-grid": LayoutGrid,
  "bar-chart-3": BarChart3,
  target: Target,
  calendar: Calendar,
};

export function Icon({
  name,
  size = 18,
  className,
  strokeWidth = 1.9,
}: {
  name: string | null | undefined;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const Cmp = (name && MAP[name]) || HelpCircle;
  return <Cmp size={size} className={className} strokeWidth={strokeWidth} />;
}
