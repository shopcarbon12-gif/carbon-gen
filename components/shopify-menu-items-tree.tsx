"use client";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type CSSProperties, type ReactElement, useMemo, useState } from "react";

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
  menuTitle: string;
  menuHandle: string;
  treeSearch: string;
  onTreeSearchChange: (value: string) => void;
  onRefreshTree: () => void;
  onSaveTree: () => Promise<void>;
  saving: boolean;
  nodes: MenuNode[];
  nodeByKey: Map<string, MenuNode>;
  childrenByParent: Map<string, string[]>;
  visibleTreeNodeIdSet: Set<string>;
  expandedNodes: Record<string, boolean>;
  selectedNodes: Record<string, boolean>;
  onMoveNode: (sourceKey: string, target: DropTarget) => Promise<void>;
  onApplyNodeSelection: (nodeKey: string) => void;
  onToggleNodeExpansion: (nodeKey: string) => void;
  onOpenEditEditor: (node: MenuNode) => void;
  onOpenAddEditor: (parentKey: string | null) => void;
  onDeleteNode: (nodeKey: string) => void;
};

type RowProps = {
  id: string;
  checked: boolean;
  dragging: boolean;
  dropState: string;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  label: string;
  targetLabel: string;
  showTargetLabel: boolean;
  onRowClick: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

function SortableTreeRow({
  id,
  checked,
  dragging,
  dropState,
  depth,
  hasChildren,
  isExpanded,
  label,
  targetLabel,
  showTargetLabel,
  onRowClick,
  onToggle,
  onEdit,
  onDelete,
}: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ["--tree-depth"]: String(depth),
  } as CSSProperties;

  return (
    <div
      ref={setNodeRef}
      className={`treeRow ${checked ? "active" : ""} ${dragging || isDragging ? "dragging" : ""} ${dropState}`}
      style={style}
      role="button"
      tabIndex={0}
      onClick={onRowClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onRowClick();
        }
      }}
    >
      <span className="dragHandle" title="Move menu item" {...attributes} {...listeners}>
        <svg viewBox="0 0 10 14" width="10" height="14">
          <circle cx="2" cy="2" r="1.1" />
          <circle cx="8" cy="2" r="1.1" />
          <circle cx="2" cy="7" r="1.1" />
          <circle cx="8" cy="7" r="1.1" />
          <circle cx="2" cy="12" r="1.1" />
          <circle cx="8" cy="12" r="1.1" />
        </svg>
      </span>
      {hasChildren ? (
        <button
          type="button"
          className="treeToggle"
          aria-label={isExpanded ? "Collapse menu item" : "Expand menu item"}
          aria-expanded={isExpanded}
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
        >
          <svg viewBox="0 0 12 12" width="12" height="12" className={isExpanded ? "" : "collapsed"}>
            <path d="M2 4l4 4 4-4H2z" />
          </svg>
        </button>
      ) : (
        <span className="treeToggleSpacer" aria-hidden="true" />
      )}
      <div className="treeText">
        <span className="treeLabel">{label}</span>
        {showTargetLabel ? <span className="treeTargetLabel">{targetLabel}</span> : null}
      </div>
      <div className="treeRowActions" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="iconBtn" onClick={onEdit} aria-label="Edit menu item">
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path d="M11.7 2.3a1 1 0 0 1 1.4 0l.6.6a1 1 0 0 1 0 1.4L6.1 12H3v-3.1l8.7-6.6zM2 13h12v1H2z" />
          </svg>
        </button>
        <button type="button" className="iconBtn danger" onClick={onDelete} aria-label="Delete menu item">
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path d="M6 2.5h4l.5 1.5H13v1H3v-1h2.5L6 2.5zm-1 3h6l-.5 7H5.5L5 5.5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function ShopifyMenuItemsTree({
  menuTitle,
  menuHandle,
  treeSearch,
  onTreeSearchChange,
  onRefreshTree,
  onSaveTree,
  saving,
  nodes,
  nodeByKey,
  childrenByParent,
  visibleTreeNodeIdSet,
  expandedNodes,
  selectedNodes,
  onMoveNode,
  onApplyNodeSelection,
  onToggleNodeExpansion,
  onOpenEditEditor,
  onOpenAddEditor,
  onDeleteNode,
}: ShopifyMenuItemsTreeProps) {
  const hasTreeSearch = treeSearch.trim().length > 0;
  const [dragSourceKey, setDragSourceKey] = useState("");
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const [dragDeltaX, setDragDeltaX] = useState(0);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const visibleNodeKeys = useMemo(() => Array.from(visibleTreeNodeIdSet), [visibleTreeNodeIdSet]);
  const parentByKey = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const node of nodes) map.set(node.nodeKey, node.parentKey || null);
    return map;
  }, [nodes]);

  function resolveDropTarget(sourceKey: string, overKey: string | null): DropTarget {
    if (!overKey || sourceKey === overKey) return null;
    let targetKey = overKey;
    let position: DropPosition = "after";
    if (dragDeltaX > 26) {
      position = "inside";
    } else if (dragDeltaX < -26) {
      const parent = parentByKey.get(overKey) || null;
      if (parent) {
        targetKey = parent;
        position = "after";
      } else {
        position = "before";
      }
    } else {
      const sourceIndex = visibleNodeKeys.indexOf(sourceKey);
      const overIndex = visibleNodeKeys.indexOf(overKey);
      position = sourceIndex < overIndex ? "after" : "before";
    }
    return { targetKey, position };
  }

  async function onDragEnd(event: DragEndEvent) {
    const sourceKey = String(event.active?.id || "");
    const overKey = String(event.over?.id || "");
    if (!sourceKey || !overKey || sourceKey === overKey) {
      setDragSourceKey("");
      setDropTarget(null);
      setDragDeltaX(0);
      return;
    }
    const target = resolveDropTarget(sourceKey, overKey);
    if (target) {
      setDragSourceKey(sourceKey);
      setDropTarget(target);
      await onMoveNode(sourceKey, target);
    }
    setDragSourceKey("");
    setDropTarget(null);
    setDragDeltaX(0);
  }

  function onDragMove(event: DragMoveEvent) {
    const sourceKey = String(event.active?.id || "");
    const overKey = String(event.over?.id || "");
    if (!sourceKey || !overKey) return;
    setDragSourceKey(sourceKey);
    setDragDeltaX(event.delta.x || 0);
    setDropTarget(resolveDropTarget(sourceKey, overKey));
  }

  const renderBranch = (parentKey: string | null, depth: number): ReactElement[] => {
    const branchKeys = (
      parentKey
        ? childrenByParent.get(parentKey) || []
        : nodes.filter((node) => !node.parentKey).map((node) => node.nodeKey)
    ).filter((nodeKey) => visibleTreeNodeIdSet.has(nodeKey));

    const renderedNodes = branchKeys
      .map((nodeKey, index) => {
        const node = nodeByKey.get(nodeKey);
        if (!node) return null;
        const checked = Boolean(selectedNodes[node.nodeKey]);
        const dragging = dragSourceKey === node.nodeKey;
        const dropState = dropTarget?.targetKey === node.nodeKey ? `drop-${dropTarget.position}` : "";
        const allChildKeys = childrenByParent.get(node.nodeKey) || [];
        const visibleChildKeys = allChildKeys.filter((childKey) =>
          visibleTreeNodeIdSet.has(childKey)
        );
        const hasChildren = allChildKeys.length > 0;
        const isExpanded = expandedNodes[node.nodeKey] !== false;
        const shouldShowChildren = visibleChildKeys.length > 0 && (hasTreeSearch || isExpanded);
        const branchHasAddRow = Boolean(parentKey);
        const isLastSibling = !branchHasAddRow && index === branchKeys.length - 1;
        const targetLabel = String(node.linkedTargetLabel || "").trim();
        const showTargetLabel = targetLabel.length > 0;

        return (
          <div
            key={node.nodeKey}
            className={`treeNode ${node.parentKey ? "has-parent" : ""} ${isLastSibling ? "is-last" : ""}`}
          >
            <SortableTreeRow
              id={node.nodeKey}
              checked={checked}
              dragging={dragging}
              dropState={dropState}
              depth={depth}
              hasChildren={hasChildren}
              isExpanded={isExpanded}
              label={node.label}
              targetLabel={targetLabel}
              showTargetLabel={showTargetLabel}
              onRowClick={() => onApplyNodeSelection(node.nodeKey)}
              onToggle={() => onToggleNodeExpansion(node.nodeKey)}
              onEdit={() => onOpenEditEditor(node)}
              onDelete={() => onDeleteNode(node.nodeKey)}
            />

            {shouldShowChildren ? (
              <div className={isExpanded || hasTreeSearch ? "nestedList treeChildren" : "nestedList treeChildren collapsed"}>
                {renderBranch(node.nodeKey, depth + 1)}
              </div>
            ) : null}
          </div>
        );
      })
      .filter((value): value is ReactElement => Boolean(value));

    if (parentKey) {
      const parent = nodeByKey.get(parentKey);
      const parentLabel = parent?.label || "parent";
      renderedNodes.push(
        <div key={`add-${parentKey}`} className="treeNode has-parent is-last treeNodeAdd">
          <div className="treeAddChild">
            <button type="button" className="treeAddChildBtn treeCard" onClick={() => onOpenAddEditor(parentKey)}>
              <span className="treeAddIcon" aria-hidden="true">
                <svg viewBox="0 0 20 20" width="18" height="18">
                  <path d="M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm1-11a1 1 0 1 0-2 0v2H7a1 1 0 1 0 0 2h2v2a1 1 0 1 0 2 0v-2h2a1 1 0 1 0 0-2h-2V7z" />
                </svg>
              </span>
              <span>Add menu item to {parentLabel}</span>
            </button>
          </div>
        </div>
      );
    }

    return renderedNodes;
  };

  return (
    <aside className="card panel gemTreePanel">
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
        <button type="button" className="treeSaveBtn" onClick={() => void onSaveTree()} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragMove={onDragMove} onDragEnd={onDragEnd}>
        <SortableContext items={visibleNodeKeys} strategy={verticalListSortingStrategy}>
          <div className="treeCanvas">
            <div className="tree shopifyMenuTree nestedList rootList">
            {renderBranch(null, 0)}
            </div>
          </div>
        </SortableContext>
      </DndContext>
      <div className="treeAddRoot">
        <button type="button" className="treeAddBtn treeCard" onClick={() => onOpenAddEditor(null)}>
          <span className="treeAddIcon" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="18" height="18">
              <path d="M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm1-11a1 1 0 1 0-2 0v2H7a1 1 0 1 0 0 2h2v2a1 1 0 1 0 2 0v-2h2a1 1 0 1 0 0-2h-2V7z" />
            </svg>
          </span>
          <span>Add menu item</span>
        </button>
      </div>
      <style jsx>{`
        .gemTreePanel {
          padding: 12px;
        }
        .treeSearchBar {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 36px auto;
          gap: 8px;
          margin-bottom: 10px;
          align-items: center;
        }
        .treeSearchInput {
          min-width: 0;
        }
        .treeRefreshBtn {
          width: 36px;
          min-width: 36px;
          min-height: 36px;
          padding: 0;
          border: 1px solid #44556f;
          border-radius: 8px;
          background: #0f1a2e;
          color: #c7d3e4;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          line-height: 1;
        }
        .treeRefreshBtn:hover {
          background: #13233d;
          border-color: #5f789c;
        }
        .treeSaveBtn {
          min-height: 36px;
          border-radius: 8px;
          border: 1px solid #168e69;
          background: #0f8a64;
          color: #f8fffc;
          padding: 0 12px;
          font-weight: 600;
        }
        .treeCanvas {
          border: 1px solid #2a3547;
          border-radius: 10px;
          background: #0a1324;
          padding: 12px 14px 10px 18px;
        }
        .tree {
          max-height: 65vh;
          overflow: auto;
        }
        .nestedList {
          margin-left: 36px;
          padding-top: 4px;
          min-height: 10px;
          display: block;
        }
        .nestedList.rootList {
          margin-left: 0;
          padding-top: 0;
        }
        :global(.treeNode) {
          position: relative;
          padding-bottom: 8px;
          margin-left: 0 !important;
        }
        :global(.treeNode.has-parent)::before {
          content: "";
          position: absolute;
          left: -22px;
          top: -8px;
          width: 22px;
          height: 31px;
          border-left: 1px solid #5d6f88;
          border-bottom: 1px solid #5d6f88;
          z-index: 0;
        }
        :global(.treeNode.has-parent:not(.is-last))::after {
          content: "";
          position: absolute;
          left: -22px;
          top: 23px;
          bottom: -8px;
          border-left: 1px solid #5d6f88;
          z-index: 0;
        }
        :global(.treeRow) {
          position: relative;
          z-index: 10;
          width: 100%;
          box-sizing: border-box;
          background: #0f1a2e;
          border: 1px solid #44556f;
          border-right: 1px solid #44556f !important;
          border-radius: 8px;
          min-height: 42px;
          padding: 0 10px;
          display: flex;
          align-items: center;
          gap: 10px;
          box-shadow: 0 1px 0 rgba(15, 23, 42, 0.24), 0 6px 16px rgba(2, 6, 23, 0.28);
        }
        :global(.treeText) {
          min-width: 0;
          display: grid;
          gap: 2px;
          align-items: center;
        }
        :global(.treeLabel) {
          color: #e6edf7;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        :global(.treeTargetLabel) {
          color: #8fa6c4;
          font-size: 11px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        :global(.treeRow:hover) {
          background: #13233d;
          border-color: #5f789c;
        }
        :global(.treeRow.active) {
          border-color: #87a8da;
          box-shadow: inset 0 0 0 1px rgba(120, 153, 210, 0.38);
        }
        :global(.treeRow.dragging) {
          opacity: 0.45;
        }
        :global(.treeRow.drop-before) {
          border-top-color: #38bdf8;
          box-shadow: inset 0 2px 0 #38bdf8;
        }
        :global(.treeRow.drop-after) {
          border-bottom-color: #38bdf8;
          box-shadow: inset 0 -2px 0 #38bdf8;
        }
        :global(.treeRow.drop-inside) {
          background: rgba(56, 189, 248, 0.08);
          box-shadow: inset 0 0 0 1px #38bdf8;
        }
        :global(.treeChildren.collapsed) {
          display: none;
        }
        :global(.treeToggle svg.collapsed) {
          transform: rotate(-90deg);
        }
        :global(.treeToggle svg) {
          transition: transform 0.2s ease;
        }
        :global(.treeToggle) {
          width: 18px;
          height: 18px;
          min-height: 18px;
          border: 0;
          padding: 0;
          background: transparent;
          color: #c2d2e8;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        :global(.treeToggle svg path) {
          fill: currentColor;
        }
        :global(.treeToggleSpacer) {
          width: 18px;
          height: 18px;
          flex: 0 0 auto;
        }
        :global(.dragHandle) {
          color: #7a889f;
          cursor: grab;
        }
        :global(.dragHandle svg circle) {
          fill: currentColor;
        }
        :global(.treeRowActions) {
          margin-left: auto;
          display: inline-flex;
          gap: 8px;
          opacity: 1;
        }
        :global(.iconBtn) {
          width: 24px;
          height: 24px;
          min-height: 24px;
          padding: 0;
          border: 1px solid #44556f;
          border-radius: 8px;
          background: #0f1a2e;
          color: #c7d3e4;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        :global(.iconBtn svg path) {
          fill: currentColor;
        }
        :global(.iconBtn:hover) {
          border-color: #5f789c;
          background: #13233d;
        }
        :global(.iconBtn.danger:hover) {
          border-color: #8b2d2d;
          color: #ffb4b4;
          background: #2a1518;
        }
        :global(.treeAddRoot) {
          margin-top: 10px;
          border-top: 1px solid rgba(255, 255, 255, 0.12);
          padding-top: 10px;
          padding-left: 0;
          padding-right: 0;
        }
        :global(.treeAddChild) {
          padding: 0;
          margin-left: 0;
        }
        :global(.treeCard) {
          width: 100%;
          box-sizing: border-box;
          border-right: 1px solid #44556f !important;
        }
        :global(.treeAddBtn),
        :global(.treeAddChildBtn) {
          width: 100%;
          min-height: 42px;
          border-radius: 8px;
          border: 1px solid #44556f;
          background: #0f1a2e;
          color: #9ac0ff;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          justify-content: flex-start;
          padding: 0 10px;
          font-size: 13px;
          box-shadow: 0 1px 0 rgba(15, 23, 42, 0.24), 0 6px 16px rgba(2, 6, 23, 0.28);
        }
        :global(.treeAddBtn:hover),
        :global(.treeAddChildBtn:hover) {
          background: #13233d;
          border-color: #5f789c;
        }
        :global(.treeAddIcon) {
          width: 20px;
          height: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #7fb2ff;
          line-height: 1;
        }
        :global(.treeAddIcon svg) {
          fill: currentColor;
        }
        :global(.treeAddBtn span:last-child),
        :global(.treeAddChildBtn span:last-child) {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        @media (max-width: 980px) {
          .treeSearchBar {
            grid-template-columns: minmax(0, 1fr) 36px;
          }
          .treeSaveBtn {
            grid-column: 1 / -1;
          }
        }
      `}</style>
    </aside>
  );
}
