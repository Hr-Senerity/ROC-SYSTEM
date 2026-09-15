import { useParams } from 'react-router-dom';
import { PerformanceMonitor } from './PerformanceMonitor';

export function ProjectVehiclesPage() {
  const { projectId } = useParams();
  return <PerformanceMonitor projectId={projectId || ''} />;
}
