"use client";

import { type CSSProperties, type ReactElement, useRef } from "react";

type DropPosition = "before" | "after" | "inside";

type MenuNode = {
  nodeKey: string;
  label: string;
  parentKey: string | null;
  depth: number;
  enabled: boolean;
  collectionId: string | null;
  linkedTargetType?: string;
  linkedTargetLabel?: string;
  linkedTargetResourceId?: string | null;
  linkedTargetUrl?: string | null;
};

type DropTarget = { targetKey: string; position: DropPosition } | null;

type ShopifyMenuItemsTreeProps = {
  treeSearch: string;
  onTreeSearchChange: (value: string) => void;
  onRefreshTree: () => void;
  saving: boolean;
  nodes: MenuNode[];
  nodeByKey: Map<string, MenuNode>;
  childrenByParent: Map<string, string[]>;
  visibleTreeNodeIdSet: Set<string>;
  expandedNodes: Record<string, boolean>;
  selectedNodes: Record<string, boolean>;
  dragSourceKey: string;
  dropTarget: DropTarget;
  onSetDragSourceKey: (value: string) => void;
  onSetDropTarget: (value: DropTarget) => void;
  onMoveMenuNode: () => void;
  onApplyNodeSelection: (nodeKey: string) => void;
  onToggleNodeExpansion: (nodeKey: string) => void;
  onOpenEditEditor: (node: MenuNode) => void;
  onOpenAddEditor: (parentKey: string | null) => void;
};

export default function ShopifyMenuItemsTree({
  treeSearch,
  onTreeSearchChange,
  onRefreshTree,
  saving,
  nodes,
  nodeByKey,
  childrenByParent,
  visibleTreeNodeIdSet,
  expandedNodes,
  selectedNodes,
  dragSourceKey,
  dropTarget,
  onSetDragSourceKey,
  onSetDropTarget,
  onMoveMenuNode,
  onApplyNodeSelection,
  onToggleNodeExpansion,
  onOpenEditEditor,
  onOpenAddEditor,
}: ShopifyMenuItemsTreeProps) {
  const hasTreeSearch = treeSearch.trim().length > 0;
  const dragStartXRef = useRef(0);

  const renderBranch = (parentKey: string | null, depth: number): ReactElement[] => {
    const branchKeys = (
      parentKey
        ? childrenByParent.get(parentKey) || []
        : nodes.filter((node) => !node.parentKey).map((node) => node.nodeKey)
    ).filter((nodeKey) => visibleTreeNodeIdSet.has(nodeKey));

    return branchKeys
      .map((nodeKey, index) => {
        const node = nodeByKey.get(nodeKey);
        if (!node) return null;
        const checked = Boolean(selectedNodes[node.nodeKey]);
        const dragging = dragSourceKey === node.nodeKey;
        const dropState = dropTarget?.targetKey === node.nodeKey ? `drop-${dropTarget.position}` : "";
        const visibleChildKeys = (childrenByParent.get(node.nodeKey) || []).filter((childKey) =>
          visibleTreeNodeIdSet.has(childKey)
        );
        const hasChildren = visibleChildKeys.length > 0;
        const isExpanded = expandedNodes[node.nodeKey] !== false;
        const shouldShowChildren = hasTreeSearch || isExpanded;
        const isLastSibling = index === branchKeys.length - 1;
        const targetLabel = String(node.linkedTargetLabel || "").trim();
        const showTargetLabel =
          targetLabel.length > 0 && targetLabel.toLowerCase() !== String(node.label || "").trim().toLowerCase();

        return (
          <div
            key={node.nodeKey}
            className={`treeNode ${node.parentKey ? "has-parent" : ""} ${isLastSibling ? "is-last" : ""}`}
            style={
              {
                ["--tree-depth"]: `${depth}`,
              } as CSSProperties
            }
          >
            <div
              className={`treeRow ${checked ? "active" : ""} ${dragging ? "dragging" : ""} ${dropState}`}
              draggable
              role="button"
              tabIndex={0}
              onClick={() => onApplyNodeSelection(node.nodeKey)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onApplyNodeSelection(node.nodeKey);
                }
              }}
              onDragStart={(event) => {
                onSetDragSourceKey(node.nodeKey);
                dragStartXRef.current = event.clientX;
                onSetDropTarget(null);
              }}
              onDragEnd={() => {
                onSetDragSourceKey("");
                onSetDropTarget(null);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (!dragSourceKey || dragSourceKey === node.nodeKey) return;
                const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                const y = event.clientY - rect.top;
                const third = rect.height / 3;
                const deltaX = event.clientX - dragStartXRef.current;
                let position: DropPosition;
                let targetKey = node.nodeKey;
                if (deltaX > 28) {
                  position = "inside";
                } else if (deltaX < -28) {
                  const parentNodeKey = node.parentKey;
                  if (parentNodeKey) {
                    targetKey = parentNodeKey;
                    position = "after";
                  } else {
                    position = "before";
                  }
                } else {
                  position = y < third ? "before" : y > third * 2 ? "after" : "inside";
                }
                onSetDropTarget({ targetKey, position });
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (!dragSourceKey || !dropTarget) return;
                onMoveMenuNode();
              }}
            >
              <span className={dragging ? "dragHandle grabbing" : "dragHandle"} aria-hidden="true" title="Move menu item">
                <svg viewBox="0 0 10 14" width="10" height="14">
                  <circle cx="2" cy="2" r="1.1" />
                  <circle cx="8" cy="2" r="1.1" />
                  <circle cx="2" cy="7" r="1.1" />
                  <circle cx="8" cy="7" r="1.1" />
                  <circle cx="2" cy="12" r="1.1" />
                  <circle cx="8" cy="12" r="1.1" />
                </svg>
                <span className="dragHandleLabel">Move</span>
              </span>
              {hasChildren ? (
                <button
                  type="button"
                  className="treeToggle"
                  aria-label={isExpanded ? "Collapse menu item" : "Expand menu item"}
                  aria-expanded={isExpanded}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleNodeExpansion(node.nodeKey);
                  }}
                >
                  <svg viewBox="0 0 12 12" width="12" height="12">
                    {isExpanded ? <path d="M2 4l4 4 4-4H2z" /> : <path d="M4 2l4 4-4 4V2z" />}
                  </svg>
                </button>
              ) : (
                <span className="treeToggleSpacer" aria-hidden="true" />
              )}
              <div className="treeText">
                <span className="treeLabel">{node.label}</span>
                {showTargetLabel ? <span className="treeTargetLabel">{targetLabel}</span> : null}
              </div>
              <div className="treeRowActions" onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  className="iconBtn"
                  onClick={() => onOpenEditEditor(node)}
                  aria-label="Edit menu item"
                >
                  <svg viewBox="0 0 16 16" width="14" height="14">
                    <path d="M11.7 2.3a1 1 0 0 1 1.4 0l.6.6a1 1 0 0 1 0 1.4L6.1 12H3v-3.1l8.7-6.6zM2 13h12v1H2z" />
                  </svg>
                </button>
              </div>
            </div>

            {hasChildren && shouldShowChildren ? (
              <>
                <div className="treeChildren">{renderBranch(node.nodeKey, depth + 1)}</div>
                <div className="treeAddChild">
                  <button type="button" className="treeAddChildBtn" onClick={() => onOpenAddEditor(node.nodeKey)}>
                    + Add menu item to {node.label}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        );
      })
      .filter((value): value is ReactElement => Boolean(value));
  };

  return (
    <aside className="card panel">
      <div className="treeSearchBar">
        <input
          className="treeSearchInput"
          value={treeSearch}
          onChange={(event) => onTreeSearchChange(event.target.value)}
          placeholder="Search menu items..."
          aria-label="Search menu tree"
        />
        <button
          type="button"
          className="treeRefreshBtn"
          aria-label="Refresh menu tree"
          onClick={onRefreshTree}
          disabled={saving}
        >
          ⟳
        </button>
      </div>
      <div className="tree shopifyMenuTree" style={{ marginTop: 8 }}>
        {renderBranch(null, 0)}
        <div className="treeAddRoot">
          <button type="button" className="treeAddBtn" onClick={() => onOpenAddEditor(null)}>
            + Add menu item
          </button>
        </div>
      </div>
    </aside>
  );
}
