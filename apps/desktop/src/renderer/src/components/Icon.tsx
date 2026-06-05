import {
  Bookmark,
  Boxes,
  Braces,
  CircleHelp,
  Database,
  FileQuestion,
  Folder,
  Leaf,
  ListTree,
  Search,
  Settings,
  SquareCheck,
  SquareTerminal,
  Table2,
  Workflow,
  type LucideIcon,
} from "lucide-react";

type IconProps = {
  name: string;
};

const iconMap: Record<string, LucideIcon> = {
  check: SquareCheck,
  code: Braces,
  collection: Table2,
  database: Database,
  explain: FileQuestion,
  folder: Folder,
  gear: Settings,
  indexes: Boxes,
  leaf: Leaf,
  mark: Bookmark,
  pipeline: Workflow,
  query: Database,
  schema: ListTree,
  search: Search,
  table: Table2,
  term: SquareTerminal,
};

export const Icon = ({ name }: IconProps) => {
  const LucideIconComponent = iconMap[name] ?? CircleHelp;

  return (
    <span className={`icon icon-${name}`} aria-hidden="true">
      <LucideIconComponent strokeWidth={2} />
    </span>
  );
};
