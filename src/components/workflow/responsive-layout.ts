export interface GraphPosition {
  x: number;
  y: number;
}

const horizontalScale = 0.75;
const verticalScale = 0.42;

/** Transpose and tighten graph positions for portrait canvases without mutating saved graph coordinates. */
export function positionForViewport(position: GraphPosition, narrow: boolean): GraphPosition {
  return narrow
    ? { x: position.y * horizontalScale, y: position.x * verticalScale }
    : { ...position };
}

/** Convert a viewport position back to the graph's canonical coordinates before storing it. */
export function positionForGraph(position: GraphPosition, narrow: boolean): GraphPosition {
  return narrow
    ? { x: position.y / verticalScale, y: position.x / horizontalScale }
    : { ...position };
}
