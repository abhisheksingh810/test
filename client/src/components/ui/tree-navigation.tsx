import { useState } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, Plus, Edit, Trash2, Copy, MoreVertical } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CourseNode, Assessment } from "@shared/schema";

interface TreeNode extends CourseNode {
  children?: TreeNode[];
  assessments?: Assessment[];
  expanded?: boolean;
}

interface TreeNavigationProps {
  nodes: TreeNode[];
  assessments: Assessment[];
  selectedNodeId?: string | null;
  selectedAssessmentId?: string | null;
  selectedNode?: TreeNode | null;
  onNodeSelect: (node: TreeNode) => void;
  onCreateNode: (parentId?: string) => void;
  onEditNode: (node: TreeNode) => void;
  onDeleteNode: (node: TreeNode) => void;
  onDuplicateNode: (node: TreeNode) => void;
  onCreateAssessment: (nodeId: string) => void;
  onEditAssessment: (assessment: Assessment) => void;
  onDeleteAssessment: (assessment: Assessment) => void;
  onDuplicateAssessment: (assessment: Assessment) => void;
  onMoveNode: (nodeId: string, newParentId: string | null) => void;
  onMoveAssessment: (assessmentId: string, newNodeId: string) => void;
}

export function TreeNavigation({
  nodes,
  assessments,
  selectedNodeId,
  selectedAssessmentId,
  selectedNode,
  onNodeSelect,
  onCreateNode,
  onEditNode,
  onDeleteNode,
  onDuplicateNode,
  onCreateAssessment,
  onEditAssessment,
  onDeleteAssessment,
  onDuplicateAssessment,
  onMoveNode,
  onMoveAssessment
}: TreeNavigationProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [dragOverNode, setDragOverNode] = useState<string | null>(null);

  // Build tree structure from flat nodes array
  const buildTree = (nodes: CourseNode[]): TreeNode[] => {
    const nodeMap = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    // Create map of all nodes
    nodes.forEach(node => {
      nodeMap.set(node.id, { ...node, children: [], assessments: [] });
    });

    // Add assessments to their respective nodes
    assessments.forEach(assessment => {
      if (assessment.courseNodeId) {
        const node = nodeMap.get(assessment.courseNodeId);
        if (node) {
          node.assessments = node.assessments || [];
          node.assessments.push(assessment);
        }
      }
    });

    // Build tree structure
    nodes.forEach(node => {
      const treeNode = nodeMap.get(node.id)!;
      if (node.parentId && nodeMap.has(node.parentId)) {
        const parent = nodeMap.get(node.parentId)!;
        parent.children!.push(treeNode);
      } else {
        roots.push(treeNode);
      }
    });

    return roots;
  };

  const toggleExpanded = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const handleDragStart = (e: React.DragEvent, nodeId: string) => {
    setDraggedNode(nodeId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', nodeId);
    e.dataTransfer.setData('application/type', 'node');
  };

  const handleDragOver = (e: React.DragEvent, nodeId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverNode(nodeId);
  };

  const handleDragLeave = () => {
    setDragOverNode(null);
  };

  const handleDrop = (e: React.DragEvent, targetNodeId: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    const draggedType = e.dataTransfer.getData('application/type');
    
    if (draggedId && draggedId !== targetNodeId) {
      if (draggedType === 'assessment') {
        // Handle assessment drop
        const draggedAssessment = assessments.find(a => a.id === draggedId);
        if (draggedAssessment && draggedAssessment.courseNodeId !== targetNodeId) {
          onMoveAssessment(draggedId, targetNodeId);
        }
      } else {
        // Handle node drop
        const draggedNode = nodes.find(n => n.id === draggedId);
        
        // Don't move if the node is already in the target location
        if (draggedNode && draggedNode.parentId !== targetNodeId) {
          // Prevent dropping a node into itself or its children
          const isChildOfDragged = (nodeId: string, parentId: string): boolean => {
            const node = nodes.find(n => n.id === nodeId);
            if (!node) return false;
            if (node.parentId === parentId) return true;
            if (node.parentId) return isChildOfDragged(node.parentId, parentId);
            return false;
          };
          
          if (!isChildOfDragged(targetNodeId, draggedId)) {
            onMoveNode(draggedId, targetNodeId);
          }
        }
      }
    }
    
    setDraggedNode(null);
    setDragOverNode(null);
  };

  const handleDropOnRoot = (e: React.DragEvent) => {
    e.preventDefault();
    const draggedNodeId = e.dataTransfer.getData('text/plain');
    
    if (draggedNodeId) {
      const draggedNode = nodes.find(n => n.id === draggedNodeId);
      
      // Only move to root if the node isn't already at root level
      if (draggedNode && draggedNode.parentId !== null) {
        onMoveNode(draggedNodeId, null);
      }
    }
    
    setDraggedNode(null);
    setDragOverNode(null);
  };

  const renderTreeNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const hasAssessments = node.assessments && node.assessments.length > 0;
    const isSelected = selectedNodeId === node.id;
    const isDraggedOver = dragOverNode === node.id;

    return (
      <div key={node.id} className="w-full">
        <div
          className={cn(
            "flex items-center py-2 px-2 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 group",
            isSelected && "bg-blue-100 dark:bg-blue-900",
            isDraggedOver && "bg-green-100 dark:bg-green-900",
            "transition-colors"
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => onNodeSelect(node)}
          draggable={true}
          onDragStart={(e) => handleDragStart(e, node.id)}
          onDragOver={(e) => handleDragOver(e, node.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, node.id)}
          data-testid={`tree-node-${node.id}`}
        >
          <div className="flex items-center flex-1 min-w-0">
            {hasChildren || hasAssessments ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 mr-1"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpanded(node.id);
                }}
                data-testid={`expand-toggle-${node.id}`}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </Button>
            ) : (
              <div className="h-4 w-4 mr-1" />
            )}
            
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 mr-2 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            ) : (
              <Folder className="h-4 w-4 mr-2 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            )}
            
            <span className="truncate text-sm font-medium">{node.name}</span>
          </div>

          <div className="flex items-center space-x-1">
            {/* Actions Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`node-actions-${node.id}`}
                >
                  <MoreVertical className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateNode(node.id);
                  }}
                  data-testid={`create-subfolder-${node.id}`}
                >
                  <Plus className="h-3 w-3 mr-2" />
                  Create Subfolder
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditNode(node);
                  }}
                  data-testid={`edit-node-${node.id}`}
                >
                  <Edit className="h-3 w-3 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicateNode(node);
                  }}
                  data-testid={`duplicate-node-${node.id}`}
                >
                  <Copy className="h-3 w-3 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteNode(node);
                  }}
                  className="text-red-600 dark:text-red-400"
                  data-testid={`delete-node-${node.id}`}
                >
                  <Trash2 className="h-3 w-3 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {isExpanded && (
          <>
            {/* Render child nodes */}
            {node.children?.map(child => renderTreeNode(child, depth + 1))}
            
            {/* Render assessments */}
            {node.assessments?.map(assessment => (
              <div
                key={assessment.id}
                className={`flex items-center py-1 px-2 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 group ${
                  selectedAssessmentId === assessment.id ? 'bg-blue-50 dark:bg-blue-900' : ''
                }`}
                style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
                onClick={() => onEditAssessment(assessment)}
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', assessment.id);
                  e.dataTransfer.setData('application/type', 'assessment');
                  e.dataTransfer.effectAllowed = 'move';
                }}
                data-testid={`assessment-${assessment.id}`}
              >
                <div className="h-4 w-4 mr-1" />
                <FileText className="h-3 w-3 mr-2 text-green-600 dark:text-green-400 flex-shrink-0" />
                <span className="truncate text-xs text-gray-600 dark:text-gray-300 flex-1">{assessment.name}</span>
                
                {/* Assessment Actions Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`assessment-actions-${assessment.id}`}
                    >
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicateAssessment(assessment);
                      }}
                      data-testid={`duplicate-assessment-${assessment.id}`}
                    >
                      <Copy className="h-3 w-3 mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteAssessment(assessment);
                      }}
                      className="text-red-600 dark:text-red-400"
                      data-testid={`delete-assessment-${assessment.id}`}
                    >
                      <Trash2 className="h-3 w-3 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}

          </>
        )}
      </div>
    );
  };

  // Helper function to check if a node is a child of another
  const isChildOf = (nodeId: string, potentialParentId: string): boolean => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || !node.parentId) return false;
    if (node.parentId === potentialParentId) return true;
    return isChildOf(node.parentId, potentialParentId);
  };

  const tree = buildTree(nodes);

  return (
    <div 
      className="w-full space-y-1" 
      data-testid="tree-navigation"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={handleDropOnRoot}
    >
      <div className="flex items-center justify-between mb-4 px-4 pt-4">
        <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300">Course Structure</h3>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCreateNode(selectedNode?.id)}
                data-testid="create-root-node"
              >
                <Plus className="h-3 w-3 mr-1" />
                New Folder
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{selectedNode ? `Create subfolder in ${selectedNode.name}` : 'Create new folder'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="space-y-1 px-4 pb-4">
        {tree.map(node => renderTreeNode(node))}
      </div>
      {tree.length === 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400 px-4">
          <Folder className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No course folders yet</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => onCreateNode()}
            data-testid="create-first-node"
          >
            <Plus className="h-3 w-3 mr-1" />
            Create Folder
          </Button>
        </div>
      )}
    </div>
  );
}