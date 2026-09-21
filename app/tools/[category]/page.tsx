import ToolsSection from '@/components/home/ToolsSection';

export default async function ToolsCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  return (
    <div style={{ paddingTop: '80px', paddingBottom: '40px' }}>
      <ToolsSection isStandalone initialCategory={category} />
    </div>
  );
}
