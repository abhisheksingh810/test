import { ChevronRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CourseNode } from "@shared/schema";

interface BreadcrumbItem {
  id: string;
  name: string;
  node?: CourseNode;
}

interface BreadcrumbNavigationProps {
  items: BreadcrumbItem[];
  onNavigate: (item: BreadcrumbItem) => void;
  className?: string;
}

export function BreadcrumbNavigation({ 
  items, 
  onNavigate, 
  className 
}: BreadcrumbNavigationProps) {
  return (
    <div className={cn("flex items-center space-x-1 text-sm", className)} data-testid="breadcrumb-navigation">
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        onClick={() => onNavigate({ id: 'root', name: 'Home' })}
        data-testid="breadcrumb-home"
      >
        <Home className="h-3 w-3" />
      </Button>
      
      {items.map((item, index) => (
        <div key={item.id} className="flex items-center">
          <ChevronRight className="h-3 w-3 text-gray-400" />
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 px-2 text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100",
              index === items.length - 1 && "text-gray-900 dark:text-gray-100 font-medium"
            )}
            onClick={() => onNavigate(item)}
            data-testid={`breadcrumb-item-${item.id}`}
          >
            {item.name}
          </Button>
        </div>
      ))}
    </div>
  );
}

// Helper function to build breadcrumb trail from a node and all nodes
export function buildBreadcrumbTrail(
  currentNode: CourseNode | null,
  allNodes: CourseNode[]
): BreadcrumbItem[] {
  if (!currentNode) return [];

  const trail: BreadcrumbItem[] = [];
  const nodeMap = new Map(allNodes.map(node => [node.id, node]));
  
  let current: CourseNode | undefined = currentNode;
  
  // Build trail from current node back to root
  while (current) {
    trail.unshift({
      id: current.id,
      name: current.name,
      node: current
    });
    
    current = current.parentId ? nodeMap.get(current.parentId) : undefined;
  }
  
  return trail;
}