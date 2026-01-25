export interface GraphNode {
  id: string;
  title: string;
  // Có thể thêm group/section để tô màu node theo chương
  sectionId?: string;
}

export interface GraphEdge {
  parent_id: string;
  child_id: string;
  type: string; // 'PREREQUISITE' | 'RELATED'
}

export interface CourseGraphResponse {
  allLessons: GraphNode[];
  allRelations: GraphEdge[];
}
