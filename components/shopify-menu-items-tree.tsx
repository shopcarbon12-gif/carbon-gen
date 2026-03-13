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
            />

            {hasChildren && shouldShowChildren ? (
              <>
                <div className={isExpanded || hasTreeSearch ? "treeChildren" : "treeChildren collapsed"}>
                  {renderBranch(node.nodeKey, depth + 1)}
                </div>
                <div className="treeItem ignoreDrag treeAddChild">
                  <button type="button" className="treeAddChildBtn treeCard" onClick={() => onOpenAddEditor(node.nodeKey)}>
                    <span className="treeAddIcon" aria-hidden="true">
                      ⊕
                    </span>
                    <span>Add menu item to {node.label}</span>
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
    <aside className="card panel gemTreePanel">
      <div className="gemTreeHeader">
        <div>
          <h3>{menuTitle || "Main menu"}</h3>
          <p>
            Handle: <code>{menuHandle || "main-menu"}</code>
          </p>
        </div>
        <button type="button" className="gemSaveBtn" onClick={() => void onSaveTree()} disabled={saving}>
          {saving ? "Saving..." : "Save menu"}
        </button>
      </div>
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
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragMove={onDragMove} onDragEnd={onDragEnd}>
        <SortableContext items={visibleNodeKeys} strategy={verticalListSortingStrategy}>
          <div className="tree shopifyMenuTree nestedList rootList" style={{ marginTop: 8 }}>
            {renderBranch(null, 0)}
          </div>
        </SortableContext>
      </DndContext>
      <div className="treeAddRoot">
        <button type="button" className="treeAddBtn treeCard" onClick={() => onOpenAddEditor(null)}>
          <span className="treeAddIcon" aria-hidden="true">
            ⊕
          </span>
          <span>Add menu item</span>
        </button>
      </div>
      <style jsx>{`
        .gemTreePanel {
          padding: 12px;
        }
        .gemTreeHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.14);
          padding-bottom: 10px;
          margin-bottom: 10px;
        }
        .gemTreeHeader h3 {
          margin: 0;
          font-size: 18px;
          color: #f8fafc;
        }
        .gemTreeHeader p {
          margin: 2px 0 0;
          color: #9fb3cc;
          font-size: 12px;
        }
        .gemTreeHeader code {
          background: rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          padding: 1px 6px;
          color: #dbeafe;
        }
        .gemSaveBtn {
          min-height: 36px;
          border-radius: 8px;
          border: 1px solid #168e69;
          background: #0f8a64;
          color: #f8fffc;
          padding: 0 14px;
          font-weight: 600;
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
        }
        :global(.treeRow:hover) {
          background: #13233d;
          border-color: #5f789c;
        }
        :global(.treeRow.active) {
          border-color: #87a8da;
          box-shadow: inset 0 0 0 1px rgba(120, 153, 210, 0.38);
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
        :global(.treeAddRoot) {
          margin-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.12);
          padding-top: 10px;
          padding-left: 0;
        }
        :global(.treeAddChild) {
          padding: 2px 0 10px 0;
          margin-left: 36px;
        }
        :global(.treeCard) {
          width: 100%;
          box-sizing: border-box;
          border-right: 1px solid #44556f !important;
        }
        :global(.treeAddBtn),
        :global(.treeAddChildBtn) {
          width: 100%;
          min-height: 36px;
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
        }
        :global(.treeAddBtn:hover),
        :global(.treeAddChildBtn:hover) {
          background: #13233d;
          border-color: #5f789c;
        }
        :global(.treeAddIcon) {
          width: 18px;
          height: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #7fb2ff;
          font-size: 14px;
          font-weight: 700;
          line-height: 1;
        }
      `}</style>
    </aside>
  );
}
