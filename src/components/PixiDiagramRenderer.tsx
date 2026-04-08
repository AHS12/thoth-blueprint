import { DbRelationship, DbRelationShipLabel } from "@/lib/constants";
import { type ProcessedEdge, type ProcessedNode, type TableNodeData } from "@/lib/types";
import { DEFAULT_TABLE_HEIGHT, DEFAULT_TABLE_WIDTH } from "@/lib/utils";
import { Application, Container, Graphics, Text, Texture, TilingSprite } from "pixi.js";
import { useCallback, useEffect, useMemo, useRef } from "react";

type ViewportState = {
    x: number;
    y: number;
    zoom: number;
};

export interface PixiRendererApi {
    zoomIn: () => void;
    zoomOut: () => void;
    fitView: () => void;
    getViewport: () => ViewportState;
}

interface PixiDiagramRendererProps {
    nodes: ProcessedNode[];
    edges: ProcessedEdge[];
    selectedNodeId: string | null;
    selectedEdgeId: string | null;
    isLocked: boolean;
    initialViewport?: ViewportState;
    onSelectNode: (nodeId: string | null) => void;
    onSelectEdge: (edgeId: string | null) => void;
    onViewportChange: (viewport: ViewportState) => void;
    onPointerMove: (position: { x: number; y: number }) => void;
    onNodeMove: (nodeId: string, position: { x: number; y: number }) => void;
    allowPanByDrag: boolean;
    adaptiveLod: boolean;
    onReady?: (api: PixiRendererApi | null) => void;
    onContextMenu: (payload: {
        screen: { x: number; y: number };
        world: { x: number; y: number };
        nodeId?: string;
        edgeId?: string;
    }) => void;
}

const GRID_SPACING = 24;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;
const CULLING_MARGIN = 240;
const ZOOM_COMMIT_DELAY_MS = 90;

function toPixiColor(color?: string): number {
    if (!color) return 0x60a5fa;
    const normalized = color.trim().replace("#", "");
    const hex = Number.parseInt(normalized, 16);
    return Number.isNaN(hex) ? 0x60a5fa : hex;
}

function getCardinalityLabels(relationship?: string): { source: string; target: string } {
    switch (relationship) {
        case DbRelationship.ONE_TO_ONE:
            return { source: DbRelationShipLabel.ONE, target: DbRelationShipLabel.ONE };
        case DbRelationship.ONE_TO_MANY:
            return { source: DbRelationShipLabel.ONE, target: DbRelationShipLabel.MANY };
        case DbRelationship.MANY_TO_ONE:
            return { source: DbRelationShipLabel.MANY, target: DbRelationShipLabel.ONE };
        case DbRelationship.MANY_TO_MANY:
            return { source: DbRelationShipLabel.MANY, target: DbRelationShipLabel.MANY };
        default:
            return { source: DbRelationShipLabel.ONE, target: DbRelationShipLabel.MANY };
    }
}

function cubicPoint(
    t: number,
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
) {
    const oneMinusT = 1 - t;
    const oneMinusTSquared = oneMinusT * oneMinusT;
    const tSquared = t * t;

    return {
        x:
            oneMinusTSquared * oneMinusT * p0.x +
            3 * oneMinusTSquared * t * p1.x +
            3 * oneMinusT * tSquared * p2.x +
            tSquared * t * p3.x,
        y:
            oneMinusTSquared * oneMinusT * p0.y +
            3 * oneMinusTSquared * t * p1.y +
            3 * oneMinusT * tSquared * p2.y +
            tSquared * t * p3.y,
    };
}

function getHandleAnchor(
    node: ProcessedNode,
    handleId: string | null | undefined,
    zoom: number,
): { x: number; y: number } {
    const nodeWidth = node.width ?? DEFAULT_TABLE_WIDTH;
    const nodeHeight = node.height ?? DEFAULT_TABLE_HEIGHT;

    // Non-table nodes keep center anchors.
    if (node.type !== "table") {
        return {
            x: node.position.x + nodeWidth / 2,
            y: node.position.y + nodeHeight / 2,
        };
    }

    const tableData = node.data as TableNodeData;
    const columns = tableData.columns || [];

    const fallback = {
        x: node.position.x + nodeWidth / 2,
        y: node.position.y + nodeHeight / 2,
    };

    if (!handleId) return fallback;

    const parts = handleId.split("-");
    if (parts.length < 3) return fallback;

    const side = parts[parts.length - 2];
    const columnId = parts.slice(0, -2).join("-");
    const idx = columns.findIndex((col) => col.id === columnId);
    if (idx < 0) return fallback;

    const headerHeight = 34;
    const rowHeight = 20;
    const y = node.position.y + headerHeight + idx * rowHeight + rowHeight / 2;
    const handleInset = Math.max(2, 3.5 / zoom);
    const x = side === "left"
        ? node.position.x - handleInset
        : node.position.x + nodeWidth + handleInset;

    return { x, y };
}

export default function PixiDiagramRenderer({
    nodes,
    edges,
    selectedNodeId,
    selectedEdgeId,
    isLocked,
    initialViewport,
    onSelectNode,
    onSelectEdge,
    onViewportChange,
    onPointerMove,
    onNodeMove,
    allowPanByDrag,
    adaptiveLod,
    onReady,
    onContextMenu,
}: PixiDiagramRendererProps) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const appRef = useRef<Application | null>(null);
    const sceneRef = useRef<{
        viewport: Container;
        gridLayer: Container;
        nodeLayer: Container;
    } | null>(null);
    const viewportRef = useRef<ViewportState>({
        x: initialViewport?.x ?? 0,
        y: initialViewport?.y ?? 0,
        zoom: initialViewport?.zoom ?? 1,
    });
    const redrawSceneRef = useRef<() => void>(() => { });
    const onSelectNodeRef = useRef(onSelectNode);
    const onSelectEdgeRef = useRef(onSelectEdge);
    const onViewportChangeRef = useRef(onViewportChange);
    const onPointerMoveRef = useRef(onPointerMove);
    const onNodeMoveRef = useRef(onNodeMove);
    const onContextMenuRef = useRef(onContextMenu);
    const allowPanByDragRef = useRef(allowPanByDrag);
    const onReadyRef = useRef(onReady);
    const gridTextureRef = useRef<Texture | null>(null);
    const nodeVisualsRef = useRef<
        Map<string, { container: Container; outline?: Graphics }>
    >(new Map());
    const edgeLayerRef = useRef<Container | null>(null);
    const redrawEdgesOnlyRef = useRef<() => void>(() => { });
    const dragStateRef = useRef<{
        nodeId: string;
        offsetX: number;
        offsetY: number;
        lastPosition?: { x: number; y: number };
    } | null>(null);

    const visibleNodes = useMemo(() => nodes.filter((node) => !node.data.isDeleted), [nodes]);

    const nodesById = useMemo(() => {
        const map = new Map<string, ProcessedNode>();
        for (const node of visibleNodes) {
            map.set(node.id, node);
        }
        return map;
    }, [visibleNodes]);

    const edgeList = useMemo(
        () => edges.filter((edge) => edge.source && edge.target),
        [edges],
    );

    const applyViewport = useCallback(() => {
        const scene = sceneRef.current;
        if (!scene) return;

        const { x, y, zoom } = viewportRef.current;
        scene.viewport.position.set(x, y);
        scene.viewport.scale.set(zoom, zoom);
    }, []);

    const textResolution = Math.min(window.devicePixelRatio || 1, 2);

    const emitViewportChange = useCallback(() => {
        onViewportChangeRef.current(viewportRef.current);
    }, []);

    const applyViewportAndRedraw = useCallback(() => {
        applyViewport();
        redrawSceneRef.current();
        emitViewportChange();
    }, [applyViewport, emitViewportChange]);

    const getNodeSize = useCallback((node: ProcessedNode) => {
        if (node.type === "table") {
            const tableData = node.data as TableNodeData;
            const computedHeight = 34 + (tableData.columns?.length || 0) * 20 + 4;
            return {
                width: node.width ?? DEFAULT_TABLE_WIDTH,
                height: Math.max(node.height ?? DEFAULT_TABLE_HEIGHT, computedHeight),
            };
        }

        if (node.type === "note") {
            return {
                width: node.width ?? 192,
                height: node.height ?? 192,
            };
        }

        return {
            width: node.width ?? 300,
            height: node.height ?? 300,
        };
    }, []);

    const screenToWorld = useCallback((screen: { x: number; y: number }) => {
        const { x, y, zoom } = viewportRef.current;
        return {
            x: (screen.x - x) / zoom,
            y: (screen.y - y) / zoom,
        };
    }, []);

    const isPrimaryPointerEvent = useCallback((event: { button?: number; nativeEvent?: unknown }) => {
        if (typeof event.button === "number") {
            return event.button === 0;
        }

        const nativeEvent = event.nativeEvent as PointerEvent | MouseEvent | undefined;
        if (nativeEvent && typeof nativeEvent.button === "number") {
            return nativeEvent.button === 0;
        }

        // Some Pixi pointertap events don't expose button reliably; treat as primary.
        return true;
    }, []);

    // buildEdgeLayer: draws all edges into a new Container.
    // positionOverrides lets drag supply a live position for the node being moved.
    // skipBadges = true skips Text creation during drag for better perf.
    const buildEdgeLayer = useCallback(
        (
            positionOverrides?: Map<string, { x: number; y: number }>,
            skipBadges = false,
        ) => {
            const { zoom } = viewportRef.current;
            const edgeContainer = new Container();
            if (adaptiveLod && zoom <= 0.1) return edgeContainer;

            const app = appRef.current;
            let worldLeft = -Infinity,
                worldTop = -Infinity,
                worldRight = Infinity,
                worldBottom = Infinity;
            if (app) {
                const { x, y } = viewportRef.current;
                const w = app.renderer.width;
                const h = app.renderer.height;
                worldLeft = -x / zoom;
                worldTop = -y / zoom;
                worldRight = worldLeft + w / zoom;
                worldBottom = worldTop + h / zoom;
            }

            for (const edge of edgeList) {
                const sourceNode = nodesById.get(edge.source);
                const targetNode = nodesById.get(edge.target);
                if (!sourceNode || !targetNode) continue;

                const sourcePos = positionOverrides?.get(sourceNode.id) ?? sourceNode.position;
                const targetPos = positionOverrides?.get(targetNode.id) ?? targetNode.position;

                // Cull when both endpoints are outside the viewport (only at low zoom with LOD)
                if (adaptiveLod && zoom < 0.2) {
                    const srcSize = getNodeSize(sourceNode);
                    const tgtSize = getNodeSize(targetNode);
                    const srcInView = !(
                        sourcePos.x + srcSize.width < worldLeft - CULLING_MARGIN ||
                        sourcePos.x > worldRight + CULLING_MARGIN ||
                        sourcePos.y + srcSize.height < worldTop - CULLING_MARGIN ||
                        sourcePos.y > worldBottom + CULLING_MARGIN
                    );
                    const tgtInView = !(
                        targetPos.x + tgtSize.width < worldLeft - CULLING_MARGIN ||
                        targetPos.x > worldRight + CULLING_MARGIN ||
                        targetPos.y + tgtSize.height < worldTop - CULLING_MARGIN ||
                        targetPos.y > worldBottom + CULLING_MARGIN
                    );
                    if (!srcInView && !tgtInView) continue;
                }

                // Build live node copies if positions were overridden (draging)
                const liveSource =
                    positionOverrides?.has(sourceNode.id)
                        ? { ...sourceNode, position: sourcePos }
                        : sourceNode;
                const liveTarget =
                    positionOverrides?.has(targetNode.id)
                        ? { ...targetNode, position: targetPos }
                        : targetNode;

                const sourceCenter = getHandleAnchor(liveSource, edge.sourceHandle, zoom);
                const targetCenter = getHandleAnchor(liveTarget, edge.targetHandle, zoom);

                const isSelected = edge.id === selectedEdgeId;
                const isHighlighted = edge.data?.isHighlighted || false;
                const strokeColor = isSelected || isHighlighted ? 0x60a5fa : 0x94a3b8;
                const strokeWidth = isSelected ? 2.5 : 1.5;
                const horizontalDelta = Math.abs(targetCenter.x - sourceCenter.x);
                const controlOffset = Math.max(40, horizontalDelta * 0.45);
                const sourceControl = {
                    x:
                        sourceCenter.x +
                        (targetCenter.x >= sourceCenter.x ? controlOffset : -controlOffset),
                    y: sourceCenter.y,
                };
                const targetControl = {
                    x:
                        targetCenter.x -
                        (targetCenter.x >= sourceCenter.x ? controlOffset : -controlOffset),
                    y: targetCenter.y,
                };

                // PixiJS v8 open-path API: .stroke() is required; lineStyle alone won't render
                const edgeGraphic = new Graphics()
                    .moveTo(sourceCenter.x, sourceCenter.y)
                    .bezierCurveTo(
                        sourceControl.x,
                        sourceControl.y,
                        targetControl.x,
                        targetControl.y,
                        targetCenter.x,
                        targetCenter.y,
                    )
                    .stroke({ color: strokeColor, width: Math.max(0.85, strokeWidth / zoom), alpha: 1 });
                edgeContainer.addChild(edgeGraphic);

                // Invisible thick hit area for easy mouse targeting
                const hitLine = new Graphics()
                    .moveTo(sourceCenter.x, sourceCenter.y)
                    .bezierCurveTo(
                        sourceControl.x,
                        sourceControl.y,
                        targetControl.x,
                        targetControl.y,
                        targetCenter.x,
                        targetCenter.y,
                    )
                    .stroke({ color: 0x000000, width: Math.max(6, 10 / zoom), alpha: 0.001 });
                hitLine.eventMode = "static";
                hitLine.cursor = "pointer";
                hitLine.on("pointerdown", (event) => {
                    if (!isPrimaryPointerEvent(event)) return;
                    event.stopPropagation();
                    onSelectEdgeRef.current(edge.id);
                    onSelectNodeRef.current(null);
                });
                hitLine.on("rightdown", (event) => {
                    event.stopPropagation();
                    const global = event.global;
                    const screen = { x: global.x, y: global.y };
                    onContextMenuRef.current({
                        screen,
                        world: screenToWorld(screen),
                        edgeId: edge.id,
                    });
                });
                edgeContainer.addChild(hitLine);

                // Cardinality badges (skipped during drag for performance)
                if (!skipBadges && zoom > 0.2) {
                    const labels = getCardinalityLabels(edge.data?.relationship);
                    const sourceBadgePoint = cubicPoint(
                        0.1,
                        sourceCenter,
                        sourceControl,
                        targetControl,
                        targetCenter,
                    );
                    const targetBadgePoint = cubicPoint(
                        0.9,
                        sourceCenter,
                        sourceControl,
                        targetControl,
                        targetCenter,
                    );

                    const drawBadge = (point: { x: number; y: number }, label: string) => {
                        const badge = new Graphics();
                        badge.beginFill(isSelected || isHighlighted ? 0x3b82f6 : 0x4b5563, 1);
                        badge.drawCircle(point.x, point.y, 8 / zoom);
                        badge.endFill();
                        edgeContainer.addChild(badge);

                        const badgeText = new Text({
                            text: label,
                            style: {
                                fontFamily: "ui-sans-serif",
                                fontSize: 9 / zoom,
                                fontWeight: "700",
                                fill: 0xffffff,
                            },
                        });
                        badgeText.resolution = textResolution;
                        badgeText.anchor.set(0.5, 0.5);
                        badgeText.position.set(point.x, point.y + 0.5 / zoom);
                        edgeContainer.addChild(badgeText);
                    };

                    drawBadge(sourceBadgePoint, labels.source);
                    drawBadge(targetBadgePoint, labels.target);
                }
            }

            return edgeContainer;
        },
        [
            adaptiveLod,
            edgeList,
            getNodeSize,
            isPrimaryPointerEvent,
            nodesById,
            screenToWorld,
            selectedEdgeId,
            textResolution,
        ],
    );

    const redrawScene = useCallback(() => {
        const app = appRef.current;
        const scene = sceneRef.current;
        if (!app || !scene) return;
        try {
            const nextGridLayer = new Container();
            const nextNodeLayer = new Container();
            const nextNodeVisuals = new Map<string, { container: Container; outline?: Graphics }>();

            const zoneLayer = new Container();
            const tableLayer = new Container();
            const noteLayer = new Container();

            const gridLayerContent = new Container();
            const { x, y, zoom } = viewportRef.current;
            const width = app.renderer.width;
            const height = app.renderer.height;

            const worldLeft = -x / zoom;
            const worldTop = -y / zoom;
            const worldRight = worldLeft + width / zoom;
            const worldBottom = worldTop + height / zoom;
            const isLowDetail = adaptiveLod && zoom <= 0.25;

            const inViewByNodeId = new Map<string, boolean>();
            for (const node of visibleNodes) {
                const size = getNodeSize(node);
                const left = node.position.x;
                const top = node.position.y;
                const right = left + size.width;
                const bottom = top + size.height;

                const inView = !(
                    right < worldLeft - CULLING_MARGIN ||
                    left > worldRight + CULLING_MARGIN ||
                    bottom < worldTop - CULLING_MARGIN ||
                    top > worldBottom + CULLING_MARGIN
                );

                inViewByNodeId.set(node.id, inView);
            }

            const startX = Math.floor(worldLeft / GRID_SPACING) * GRID_SPACING;
            const endX = Math.ceil(worldRight / GRID_SPACING) * GRID_SPACING;
            const startY = Math.floor(worldTop / GRID_SPACING) * GRID_SPACING;
            const endY = Math.ceil(worldBottom / GRID_SPACING) * GRID_SPACING;

            if (gridTextureRef.current) {
                const gridSprite = new TilingSprite({
                    texture: gridTextureRef.current,
                    width: endX - startX + GRID_SPACING,
                    height: endY - startY + GRID_SPACING,
                });
                gridSprite.position.set(startX, startY);
                gridLayerContent.addChild(gridSprite);
            }
            nextGridLayer.addChild(gridLayerContent);

            // Build edge layer using current stored positions
            const edgeLayer = buildEdgeLayer();

            for (const node of visibleNodes) {
                if (!(inViewByNodeId.get(node.id) ?? false)) {
                    continue;
                }

                const nodeContainer = new Container();
                const { width: widthPx, height: heightPx } = getNodeSize(node);

                nodeContainer.position.set(node.position.x, node.position.y);
                nodeContainer.eventMode = "static";
                nodeContainer.cursor = "pointer";

                const background = new Graphics();
                background.lineStyle(1.2 / zoom, 0xd1d5db, 1);

                if (node.type === "note") {
                    background.beginFill(0xfef08a, 1);
                    if (isLowDetail) {
                        background.drawRect(0, 0, Math.max(24, widthPx * 0.2), Math.max(24, heightPx * 0.2));
                    } else {
                        background.drawRoundedRect(0, 0, widthPx, heightPx, 8);
                    }
                } else if (node.type === "zone") {
                    background.beginFill(toPixiColor(node.data.color as string), 0.14);
                    background.drawRoundedRect(0, 0, widthPx, heightPx, 12);
                } else {
                    background.beginFill(0xffffff, 1);
                    if (isLowDetail) {
                        background.drawRoundedRect(0, 0, Math.max(18, widthPx * 0.18), Math.max(12, heightPx * 0.12), 4);
                    } else {
                        background.drawRoundedRect(0, 0, widthPx, heightPx, 10);
                    }
                }

                background.endFill();

                nodeContainer.addChild(background);

                if (node.type === "table") {
                    const header = new Graphics();
                    header.beginFill(toPixiColor(node.data.color as string), 1);
                    header.drawRoundedRect(0, 0, widthPx, 8, 10);
                    header.endFill();
                    nodeContainer.addChild(header);
                }

                let selectedOutline: Graphics | undefined;
                if (selectedNodeId === node.id) {
                    selectedOutline = new Graphics();
                    selectedOutline.lineStyle(2 / zoom, 0x3b82f6, 1);
                    if (isLowDetail && node.type !== "zone") {
                        selectedOutline.drawRoundedRect(-2, -2, Math.max(18, widthPx * 0.18) + 4, Math.max(12, heightPx * 0.12) + 4, 6);
                    } else {
                        selectedOutline.drawRoundedRect(-2, -2, widthPx + 4, heightPx + 4, 12);
                    }
                    if (node.type === "zone") {
                        zoneLayer.addChild(selectedOutline);
                    } else if (node.type === "note") {
                        noteLayer.addChild(selectedOutline);
                    } else {
                        tableLayer.addChild(selectedOutline);
                    }
                    selectedOutline.position.set(node.position.x, node.position.y);
                }

                let nodeLabel = "";
                if (node.type === "table") {
                    nodeLabel = String(node.data.label || "");
                } else if (node.type === "note") {
                    nodeLabel = String(node.data.text || "");
                } else {
                    nodeLabel = String(node.data.name || "Zone");
                }

                const label = new Text({
                    text: isLowDetail && node.type === "note" ? "" : nodeLabel,
                    style: {
                        fontFamily: "ui-sans-serif",
                        fontSize: isLowDetail ? 10 : node.type === "note" ? 12 : 13,
                        fill: 0x111827,
                        fontWeight: node.type === "zone" ? "700" : "600",
                        wordWrap: node.type === "note" && !isLowDetail,
                        wordWrapWidth: Math.max(40, widthPx - 16),
                    },
                });
                label.resolution = textResolution;

                if (node.type === "zone") {
                    label.position.set(10, 8);
                } else {
                    label.position.set(12, 16);
                }

                if (node.type === "table" && !isLowDetail) {
                    const tableData = node.data as TableNodeData;
                    const columns = tableData.columns || [];
                    const rowHeight = 20;
                    const headerHeight = 34;
                    const maxRows = Math.max(0, Math.floor((heightPx - headerHeight) / rowHeight));
                    const shownColumns = columns.slice(0, maxRows);

                    const divider = new Graphics();
                    divider.lineStyle(1 / zoom, 0xe5e7eb, 1);
                    divider.moveTo(0, headerHeight);
                    divider.lineTo(widthPx, headerHeight);
                    nodeContainer.addChild(divider);

                    shownColumns.forEach((col, idx) => {
                        const rowY = headerHeight + idx * rowHeight;

                        const rowLine = new Graphics();
                        rowLine.lineStyle(1 / zoom, 0xf1f5f9, 1);
                        rowLine.moveTo(0, rowY + rowHeight);
                        rowLine.lineTo(widthPx, rowY + rowHeight);
                        nodeContainer.addChild(rowLine);

                        const nameText = new Text({
                            text: `${col.pk ? "* " : ""}${col.name}${col.nullable ? " ?" : ""}`,
                            style: {
                                fontFamily: "ui-sans-serif",
                                fontSize: 11,
                                fill: 0x1f2937,
                            },
                        });
                        nameText.resolution = textResolution;
                        nameText.position.set(10, rowY + 4);
                        nodeContainer.addChild(nameText);

                        const typeText = new Text({
                            text: col.type,
                            style: {
                                fontFamily: "ui-monospace",
                                fontSize: 10,
                                fill: 0x6b7280,
                            },
                        });
                        typeText.resolution = textResolution;
                        typeText.anchor.set(1, 0);
                        typeText.position.set(widthPx - 10, rowY + 5);
                        nodeContainer.addChild(typeText);

                        if (selectedNodeId === node.id) {
                            const leftHandle = new Graphics();
                            leftHandle.beginFill(toPixiColor(tableData.color), 1);
                            leftHandle.drawCircle(-2, rowY + rowHeight / 2, 3.5);
                            leftHandle.endFill();
                            nodeContainer.addChild(leftHandle);

                            const rightHandle = new Graphics();
                            rightHandle.beginFill(toPixiColor(tableData.color), 1);
                            rightHandle.drawCircle(widthPx + 2, rowY + rowHeight / 2, 3.5);
                            rightHandle.endFill();
                            nodeContainer.addChild(rightHandle);
                        }
                    });
                }

                nodeContainer.on("rightdown", (event) => {
                    event.stopPropagation();
                    const global = event.global;
                    const screen = { x: global.x, y: global.y };
                    onContextMenuRef.current({
                        screen,
                        world: screenToWorld(screen),
                        nodeId: node.id,
                    });
                });

                nodeContainer.on("pointerdown", (event) => {
                    if (!isPrimaryPointerEvent(event)) return;
                    event.stopPropagation();
                    onSelectNodeRef.current(node.id);
                    onSelectEdgeRef.current(null);

                    if (isLocked || !node.draggable) return;
                    const nativeEvent = event.nativeEvent as PointerEvent;
                    if (nativeEvent.button !== 0) return;

                    const global = event.global;
                    const world = screenToWorld({ x: global.x, y: global.y });
                    dragStateRef.current = {
                        nodeId: node.id,
                        offsetX: world.x - node.position.x,
                        offsetY: world.y - node.position.y,
                        lastPosition: { x: node.position.x, y: node.position.y },
                    };
                });

                nodeContainer.addChild(label);

                if (selectedOutline) {
                    nextNodeVisuals.set(node.id, {
                        container: nodeContainer,
                        outline: selectedOutline,
                    });
                } else {
                    nextNodeVisuals.set(node.id, {
                        container: nodeContainer,
                    });
                }

                if (node.type === "zone") {
                    zoneLayer.addChild(nodeContainer);
                } else if (node.type === "note") {
                    noteLayer.addChild(nodeContainer);
                } else {
                    tableLayer.addChild(nodeContainer);
                }
            }

            nextNodeLayer.addChild(zoneLayer);
            nextNodeLayer.addChild(edgeLayer);
            nextNodeLayer.addChild(tableLayer);
            nextNodeLayer.addChild(noteLayer);

            scene.viewport.removeChildren();
            scene.viewport.addChild(nextGridLayer);
            scene.viewport.addChild(nextNodeLayer);
            scene.gridLayer = nextGridLayer;
            scene.nodeLayer = nextNodeLayer;
            nodeVisualsRef.current = nextNodeVisuals;
            edgeLayerRef.current = edgeLayer;
            applyViewport();
        } catch (error) {
            console.error("Pixi redraw failed:", error);
        }
    }, [
        adaptiveLod,
        applyViewport,
        buildEdgeLayer,
        getNodeSize,
        isPrimaryPointerEvent,
        isLocked,
        screenToWorld,
        selectedNodeId,
        textResolution,
        visibleNodes,
    ]);

    useEffect(() => {
        redrawSceneRef.current = redrawScene;
    }, [redrawScene]);

    // redrawEdgesOnly: rebuilds only the edge layer with optional drag position overrides.
    // Much faster than a full redraw — only replaces the edge Container (~edges × 2 graphics).
    const redrawEdgesOnly = useCallback(() => {
        const scene = sceneRef.current;
        const oldEdgeLayer = edgeLayerRef.current;
        if (!scene || !oldEdgeLayer) return;
        try {
            const dragState = dragStateRef.current;
            const positionOverrides =
                dragState?.lastPosition != null
                    ? new Map([[dragState.nodeId, dragState.lastPosition]])
                    : undefined;

            // Skip Text badge creation during drag for better frame rate
            const isDragging = positionOverrides != null;
            const newEdgeLayer = buildEdgeLayer(positionOverrides, isDragging);

            // Edge layer is always the 2nd child of nodeLayer (index 1): zones[0], edges[1], tables[2], notes[3]
            const nodeLayer = scene.nodeLayer;
            if (nodeLayer.children.length > 1) {
                nodeLayer.removeChildAt(1);
                oldEdgeLayer.destroy({ children: true });
                nodeLayer.addChildAt(newEdgeLayer, 1);
            }
            edgeLayerRef.current = newEdgeLayer;
        } catch (e) {
            console.error("Edge layer redraw failed:", e);
        }
    }, [buildEdgeLayer]);

    useEffect(() => {
        redrawEdgesOnlyRef.current = redrawEdgesOnly;
    }, [redrawEdgesOnly]);

    useEffect(() => {
        onSelectNodeRef.current = onSelectNode;
    }, [onSelectNode]);

    useEffect(() => {
        onSelectEdgeRef.current = onSelectEdge;
    }, [onSelectEdge]);

    useEffect(() => {
        onViewportChangeRef.current = onViewportChange;
    }, [onViewportChange]);

    useEffect(() => {
        onPointerMoveRef.current = onPointerMove;
    }, [onPointerMove]);

    useEffect(() => {
        onNodeMoveRef.current = onNodeMove;
    }, [onNodeMove]);

    useEffect(() => {
        onContextMenuRef.current = onContextMenu;
    }, [onContextMenu]);

    useEffect(() => {
        allowPanByDragRef.current = allowPanByDrag;
    }, [allowPanByDrag]);

    useEffect(() => {
        onReadyRef.current = onReady;
    }, [onReady]);

    useEffect(() => {
        let mounted = true;
        let resizeObserver: ResizeObserver | null = null;

        const initialize = async () => {
            if (!hostRef.current || appRef.current) return;

            const app = new Application();
            await app.init({
                backgroundAlpha: 0,
                antialias: true,
                preference: "webgpu",
                resolution: Math.min(window.devicePixelRatio || 1, 2),
                autoDensity: true,
                resizeTo: hostRef.current,
            });

            const dotCanvas = document.createElement("canvas");
            dotCanvas.width = GRID_SPACING;
            dotCanvas.height = GRID_SPACING;
            const dotContext = dotCanvas.getContext("2d");
            if (dotContext) {
                dotContext.clearRect(0, 0, GRID_SPACING, GRID_SPACING);
                dotContext.fillStyle = "rgba(212, 212, 216, 0.9)";
                dotContext.beginPath();
                dotContext.arc(1, 1, 1, 0, Math.PI * 2);
                dotContext.fill();
                gridTextureRef.current = Texture.from(dotCanvas);
            }

            if (!mounted) {
                app.destroy(true, { children: true });
                return;
            }

            hostRef.current.appendChild(app.canvas);
            appRef.current = app;

            const viewport = new Container();
            const gridLayer = new Container();
            const nodeLayer = new Container();

            viewport.addChild(gridLayer);
            viewport.addChild(nodeLayer);
            app.stage.addChild(viewport);
            app.stage.eventMode = "static";

            app.stage.hitArea = app.screen;
            app.stage.on("pointerdown", (event) => {
                if (!isPrimaryPointerEvent(event)) return;
                // Only clear selection when clicking empty canvas, not when a child handled the event.
                if (event.target !== app.stage) return;
                onSelectNodeRef.current(null);
                onSelectEdgeRef.current(null);
            });

            const handleStageRightDown = (event: { global: { x: number; y: number } }) => {
                const global = event.global;
                const screen = { x: global.x, y: global.y };
                onContextMenuRef.current({
                    screen,
                    world: screenToWorld(screen),
                });
            };

            app.stage.on("rightdown", handleStageRightDown);

            sceneRef.current = { viewport, gridLayer, nodeLayer };
            applyViewport();
            redrawSceneRef.current();

            let isMiddlePanning = false;
            let lastX = 0;
            let lastY = 0;
            let zoomFrameRaf: number | null = null;
            let zoomCommitTimer: number | null = null;
            let pendingWheelDeltaY = 0;
            let wheelAnchorX = 0;
            let wheelAnchorY = 0;

            const scheduleZoomCommit = () => {
                if (zoomCommitTimer != null) {
                    window.clearTimeout(zoomCommitTimer);
                }
                zoomCommitTimer = window.setTimeout(() => {
                    zoomCommitTimer = null;
                    redrawSceneRef.current();
                    emitViewportChange();
                }, ZOOM_COMMIT_DELAY_MS);
            };

            const performZoomAroundPoint = (
                screenX: number,
                screenY: number,
                nextZoom: number,
                interactive = false,
            ) => {
                const oldZoom = viewportRef.current.zoom;
                if (nextZoom === oldZoom) return;

                const worldX = (screenX - viewportRef.current.x) / oldZoom;
                const worldY = (screenY - viewportRef.current.y) / oldZoom;

                viewportRef.current = {
                    x: screenX - worldX * nextZoom,
                    y: screenY - worldY * nextZoom,
                    zoom: nextZoom,
                };

                if (interactive) {
                    applyViewport();
                    scheduleZoomCommit();
                    return;
                }

                applyViewportAndRedraw();
            };

            const flushWheelZoom = () => {
                zoomFrameRaf = null;
                if (pendingWheelDeltaY === 0) return;

                const wheelDelta = pendingWheelDeltaY;
                pendingWheelDeltaY = 0;

                // Continuous wheel scaling feels smoother than fixed 0.9/1.1 steps.
                const currentZoom = viewportRef.current.zoom;
                const zoomFactor = Math.exp(-wheelDelta * 0.0015);
                const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom * zoomFactor));
                performZoomAroundPoint(wheelAnchorX, wheelAnchorY, nextZoom, true);
            };

            const fitToNodes = () => {
                if (!visibleNodes.length || !appRef.current) return;

                let minX = Number.POSITIVE_INFINITY;
                let minY = Number.POSITIVE_INFINITY;
                let maxX = Number.NEGATIVE_INFINITY;
                let maxY = Number.NEGATIVE_INFINITY;

                for (const node of visibleNodes) {
                    const size = getNodeSize(node);
                    minX = Math.min(minX, node.position.x);
                    minY = Math.min(minY, node.position.y);
                    maxX = Math.max(maxX, node.position.x + size.width);
                    maxY = Math.max(maxY, node.position.y + size.height);
                }

                const contentWidth = Math.max(1, maxX - minX);
                const contentHeight = Math.max(1, maxY - minY);
                const viewportWidth = appRef.current.renderer.width;
                const viewportHeight = appRef.current.renderer.height;
                const padding = 96;

                const zoomX = (viewportWidth - padding * 2) / contentWidth;
                const zoomY = (viewportHeight - padding * 2) / contentHeight;
                const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(zoomX, zoomY)));

                viewportRef.current = {
                    x: padding - minX * zoom + (viewportWidth - padding * 2 - contentWidth * zoom) / 2,
                    y: padding - minY * zoom + (viewportHeight - padding * 2 - contentHeight * zoom) / 2,
                    zoom,
                };

                applyViewportAndRedraw();
            };

            onReadyRef.current?.({
                zoomIn: () => {
                    const renderer = appRef.current?.renderer;
                    if (!renderer) return;
                    const nextZoom = Math.min(MAX_ZOOM, viewportRef.current.zoom * 1.2);
                    performZoomAroundPoint(renderer.width / 2, renderer.height / 2, nextZoom, true);
                },
                zoomOut: () => {
                    const renderer = appRef.current?.renderer;
                    if (!renderer) return;
                    const nextZoom = Math.max(MIN_ZOOM, viewportRef.current.zoom * 0.8);
                    performZoomAroundPoint(renderer.width / 2, renderer.height / 2, nextZoom, true);
                },
                fitView: () => {
                    fitToNodes();
                },
                getViewport: () => ({ ...viewportRef.current }),
            });

            const handlePointerDown = (event: PointerEvent) => {
                if (event.button !== 1 && !(event.button === 0 && allowPanByDragRef.current)) return;
                event.preventDefault();
                isMiddlePanning = true;
                lastX = event.clientX;
                lastY = event.clientY;
            };

            const handlePointerMove = (event: PointerEvent) => {
                onPointerMoveRef.current({ x: event.clientX, y: event.clientY });

                const appInstance = appRef.current;
                if (!appInstance) return;

                const rect = appInstance.canvas.getBoundingClientRect();
                const screenX = event.clientX - rect.left;
                const screenY = event.clientY - rect.top;

                const dragState = dragStateRef.current;
                if (dragState) {
                    const world = screenToWorld({ x: screenX, y: screenY });
                    const nextPosition = {
                        x: world.x - dragState.offsetX,
                        y: world.y - dragState.offsetY,
                    };
                    dragState.lastPosition = nextPosition;

                    const visual = nodeVisualsRef.current.get(dragState.nodeId);
                    if (visual) {
                        visual.container.position.set(nextPosition.x, nextPosition.y);
                        if (visual.outline) {
                            visual.outline.position.set(nextPosition.x, nextPosition.y);
                        }
                    }

                    // Redraw only the edge layer so edges stay connected to the moving node
                    redrawEdgesOnlyRef.current();

                    lastX = event.clientX;
                    lastY = event.clientY;
                    return;
                }

                if (!isMiddlePanning) return;

                const dx = event.clientX - lastX;
                const dy = event.clientY - lastY;

                lastX = event.clientX;
                lastY = event.clientY;

                viewportRef.current = {
                    ...viewportRef.current,
                    x: viewportRef.current.x + dx,
                    y: viewportRef.current.y + dy,
                };

                // Keep pan interaction ultra-cheap: only move viewport transform.
                applyViewport();
            };

            const handlePointerUp = () => {
                const wasPanning = isMiddlePanning;
                isMiddlePanning = false;
                const dragState = dragStateRef.current;
                if (dragState?.lastPosition) {
                    onNodeMoveRef.current(dragState.nodeId, dragState.lastPosition);
                }
                dragStateRef.current = null;

                if (wasPanning) {
                    // Finalize pan once: refresh culling/grid coverage and persist latest viewport.
                    redrawSceneRef.current();
                    emitViewportChange();
                }
            };

            const handleWheel = (event: WheelEvent) => {
                event.preventDefault();

                const rect = app.canvas.getBoundingClientRect();
                const screenX = event.clientX - rect.left;
                const screenY = event.clientY - rect.top;

                wheelAnchorX = screenX;
                wheelAnchorY = screenY;
                pendingWheelDeltaY += event.deltaY;

                if (zoomFrameRaf == null) {
                    zoomFrameRaf = window.requestAnimationFrame(flushWheelZoom);
                }
            };

            app.canvas.addEventListener("pointerdown", handlePointerDown);
            app.canvas.addEventListener("pointermove", handlePointerMove);
            window.addEventListener("pointerup", handlePointerUp);
            app.canvas.addEventListener("wheel", handleWheel, { passive: false });

            resizeObserver = new ResizeObserver(() => {
                redrawSceneRef.current();
            });

            resizeObserver.observe(hostRef.current);

            return () => {
                onReadyRef.current?.(null);
                app.stage.off("rightdown", handleStageRightDown);
                if (zoomFrameRaf != null) {
                    window.cancelAnimationFrame(zoomFrameRaf);
                    zoomFrameRaf = null;
                }
                if (zoomCommitTimer != null) {
                    window.clearTimeout(zoomCommitTimer);
                    zoomCommitTimer = null;
                }
                app.canvas.removeEventListener("pointerdown", handlePointerDown);
                app.canvas.removeEventListener("pointermove", handlePointerMove);
                app.canvas.removeEventListener("wheel", handleWheel);
                window.removeEventListener("pointerup", handlePointerUp);
                resizeObserver?.disconnect();
            };
        };

        let cleanup: (() => void) | undefined;
        void initialize().then((dispose) => {
            cleanup = dispose;
        });

        return () => {
            mounted = false;
            cleanup?.();
            resizeObserver?.disconnect();

            if (appRef.current) {
                appRef.current.destroy(true, { children: true });
                appRef.current = null;
            }

            if (gridTextureRef.current) {
                gridTextureRef.current.destroy(true);
                gridTextureRef.current = null;
            }

            sceneRef.current = null;
        };
    }, [applyViewport, applyViewportAndRedraw, emitViewportChange, getNodeSize, isPrimaryPointerEvent, screenToWorld, visibleNodes]);

    useEffect(() => {
        if (initialViewport) {
            viewportRef.current = {
                x: initialViewport.x,
                y: initialViewport.y,
                zoom: initialViewport.zoom,
            };
            applyViewport();
            redrawScene();
        }
    }, [applyViewport, initialViewport, redrawScene]);

    useEffect(() => {
        redrawScene();
    }, [redrawScene]);

    return <div ref={hostRef} className="h-full w-full bg-background overflow-hidden" />;
}
