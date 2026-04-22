import * as pc from 'playcanvas';
import type { NodeKind, EdgeKind } from '@codevisualizer/types';

export const NODE_COLORS: Record<NodeKind, pc.Color> = {
  MODULE:   new pc.Color(0.118, 0.227, 0.541),  // #1E3A8A deep blue
  CLASS:    new pc.Color(0.851, 0.467, 0.024),  // #D97706 amber
  FUNCTION: new pc.Color(0.022, 0.533, 0.412),  // #059669 emerald
  METHOD:   new pc.Color(0.035, 0.569, 0.698),  // #0891B2 teal
  VARIABLE: new pc.Color(0.392, 0.455, 0.545),  // #64748B slate
};

export const EDGE_COLORS: Record<EdgeKind, pc.Color> = {
  IMPORT:      new pc.Color(0.263, 0.220, 0.792),  // #4338CA indigo
  CALL:        new pc.Color(0.024, 0.714, 0.831),  // #06B6D4 cyan
  INHERITANCE: new pc.Color(0.918, 0.349, 0.000),  // #EA580C orange
  DATA_FLOW:   new pc.Color(0.859, 0.153, 0.467),  // #DB2777 pink
  EXPORT:      new pc.Color(0.580, 0.635, 0.722),  // #94A3B8 gray
};

export const ACTIVE_COLOR = new pc.Color(1, 0.9, 0.2);    // bright yellow-white signal
export const HOVER_COLOR  = new pc.Color(0.9, 0.9, 1.0);
