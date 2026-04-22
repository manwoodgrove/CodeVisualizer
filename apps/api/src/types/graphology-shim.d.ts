declare module 'graphology' {
  interface GraphOptions {
    type?: 'directed' | 'undirected' | 'mixed';
    multi?: boolean;
  }

  interface NodeAttributes {
    [key: string]: unknown;
  }

  class Graph {
    constructor(options?: GraphOptions);
    addNode(id: string, attributes?: NodeAttributes): string;
    addEdge(source: string, target: string, attributes?: NodeAttributes): string;
    hasNode(id: string): boolean;
    hasEdge(source: string, target: string): boolean;
    getNodeAttributes(id: string): NodeAttributes;
    setNodeAttribute(id: string, attribute: string, value: unknown): void;
    nodes(): string[];
    edges(): string[];
  }

  export default Graph;
}

declare module 'graphology-communities-louvain' {
  import type Graph from 'graphology';
  function louvain(graph: Graph, options?: object): Record<string, number>;
  export default louvain;
}

declare module 'graphology-layout-forceatlas2' {
  import type Graph from 'graphology';

  interface FA2Options {
    iterations?: number;
    settings?: {
      linLogMode?: boolean;
      barnesHutOptimize?: boolean;
      scalingRatio?: number;
      strongGravityMode?: boolean;
      gravity?: number;
    };
  }

  function forceAtlas2(graph: Graph, options: FA2Options): Record<string, { x: number; y: number }>;
  namespace forceAtlas2 {
    function assign(graph: Graph, options: FA2Options): void;
  }
  export default forceAtlas2;
}
