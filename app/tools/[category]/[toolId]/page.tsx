import ToolPage from '@/components/tools/ToolPage';

export default async function ToolDetailPage({ params }: { params: Promise<{ category: string; toolId: string }> }) {
  const { category, toolId } = await params;
  return <ToolPage toolId={toolId} category={category} />;
}
