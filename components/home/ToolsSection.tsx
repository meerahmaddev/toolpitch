'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import './ToolsSection.css';
import {
  FileText,
  Scissors,
  Merge,
  Mic,
  DownloadCloud,
  ImageIcon,
  Edit3,
  type LucideIcon,
} from 'lucide-react';

export interface ToolDef {
  id: number;
  title: string;
  slug: string;
  description: string;
  category: string;
  icon: LucideIcon;
  isNew: boolean;
}

export const toolsData: ToolDef[] = [
  // 1. PDF to Other Formats
  { id: 1, title: 'PDF to Word', slug: 'pdf-to-word', description: 'Convert your PDF files to editable Microsoft Word documents (DOCX).', category: 'PDF Tools', icon: FileText, isNew: true },
  { id: 2, title: 'PDF to Excel', slug: 'pdf-to-excel', description: 'Convert PDF tables and financial statements into structured Excel spreadsheets (XLSX).', category: 'PDF Tools', icon: FileText, isNew: true },
  { id: 3, title: 'PDF to PowerPoint', slug: 'pdf-to-ppt', description: 'Turn your PDF slides into an editable PowerPoint presentation format.', category: 'PDF Tools', icon: FileText, isNew: true },

  // 2. Other Formats to PDF
  { id: 6, title: 'Word to PDF', slug: 'word-to-pdf', description: 'Convert your Office Word documents (DOC/DOCX) into a fixed-layout PDF.', category: 'PDF Tools', icon: FileText, isNew: true },
  { id: 7, title: 'Excel to PDF', slug: 'excel-to-pdf', description: 'Convert your spreadsheets (XLS/XLSX) into printable PDF pages.', category: 'PDF Tools', icon: FileText, isNew: true },
  { id: 8, title: 'PPT to PDF', slug: 'ppt-to-pdf', description: 'Convert your PowerPoint slide decks into a print-ready PDF file.', category: 'PDF Tools', icon: FileText, isNew: true },
  { id: 9, title: 'Images to PDF', slug: 'images-to-pdf', description: 'Arrange single or multiple images in a sequence and merge them into one PDF file.', category: 'PDF Tools', icon: ImageIcon, isNew: true },
  { id: 10, title: 'TXT to PDF', slug: 'txt-to-pdf', description: 'Convert simple text files or markdown into a well-formatted PDF document.', category: 'PDF Tools', icon: FileText, isNew: true },
  { id: 11, title: 'Merge PDF', slug: 'merge-pdf', description: 'Combine multiple PDF files into one single document seamlessly.', category: 'PDF Tools', icon: Merge, isNew: true },
  { id: 12, title: 'Split PDF', slug: 'split-pdf', description: 'Visually extract pages or split a PDF into multiple separate documents.', category: 'PDF Tools', icon: Scissors, isNew: true },
  { id: 13, title: 'Compress PDF', slug: 'compress-pdf', description: 'Reduce PDF file size while maintaining high visual quality using Ghostscript.', category: 'PDF Tools', icon: FileText, isNew: true },
  { id: 14, title: 'Edit PDF', slug: 'edit-pdf', description: 'Click into existing PDF text and edit it in place, or reposition images and logos.', category: 'PDF Tools', icon: Edit3, isNew: true },

  // 2. Image Tools (Conversion) - grouped by source format so related tools sit together
  { id: 101, title: 'JPG to PNG', slug: 'jpg-to-png', description: 'Convert your JPG/JPEG images to PNG format instantly without losing quality.', category: 'Image Tools', icon: ImageIcon, isNew: false },
  { id: 102, title: 'JPG to WEBP', slug: 'jpg-to-webp', description: 'Convert your JPG images to WebP format for smaller sizes and faster web loading.', category: 'Image Tools', icon: ImageIcon, isNew: false },
  { id: 103, title: 'PNG to JPG', slug: 'png-to-jpg', description: 'Convert your PNG images to JPG/JPEG format for smaller file sizes.', category: 'Image Tools', icon: ImageIcon, isNew: false },
  { id: 104, title: 'PNG to WEBP', slug: 'png-to-webp', description: 'Convert your PNG images to WebP format for smaller sizes and faster web loading.', category: 'Image Tools', icon: ImageIcon, isNew: false },
  { id: 105, title: 'WEBP to JPG', slug: 'webp-to-jpg', description: 'Convert your WebP images to standard JPG format.', category: 'Image Tools', icon: ImageIcon, isNew: false },
  { id: 106, title: 'WEBP to PNG', slug: 'webp-to-png', description: 'Convert your WebP images to standard PNG format with transparency.', category: 'Image Tools', icon: ImageIcon, isNew: false },
  { id: 107, title: 'HEIC to JPG', slug: 'heic-to-jpg', description: 'Convert Apple HEIC photos to standard JPG format.', category: 'Image Tools', icon: ImageIcon, isNew: false },
  { id: 108, title: 'HEIC to PNG', slug: 'heic-to-png', description: 'Convert Apple HEIC photos to standard PNG format.', category: 'Image Tools', icon: ImageIcon, isNew: false },
  { id: 109, title: 'HEIC to WEBP', slug: 'heic-to-webp', description: 'Convert Apple HEIC photos to WebP format for smaller sizes and faster web loading.', category: 'Image Tools', icon: ImageIcon, isNew: false },
  { id: 110, title: 'SVG to JPG', slug: 'svg-to-jpg', description: 'Transform vector SVG graphics into high-quality raster JPG images.', category: 'Image Tools', icon: ImageIcon, isNew: false },
  { id: 111, title: 'SVG to PNG', slug: 'svg-to-png', description: 'Transform vector SVG graphics into high-quality raster PNG images.', category: 'Image Tools', icon: ImageIcon, isNew: false },
  { id: 112, title: 'SVG to WEBP', slug: 'svg-to-webp', description: 'Transform vector SVG graphics into high-quality raster WebP images.', category: 'Image Tools', icon: ImageIcon, isNew: false },

  // 3. Editor Tools
  { id: 301, title: 'Edit PDF', slug: 'edit-pdf', description: 'Click into existing PDF text and edit it in place, or reposition images and logos.', category: 'Editor Tools', icon: Edit3, isNew: true },
  { id: 302, title: 'Compress PDF', slug: 'compress-pdf', description: 'Reduce PDF file size while maintaining high visual quality using Ghostscript.', category: 'Editor Tools', icon: FileText, isNew: true },
  { id: 303, title: 'Image Compressor', slug: 'image-compressor', description: 'Reduce the file size of your images while keeping good quality, with format and quality control.', category: 'Editor Tools', icon: DownloadCloud, isNew: true },

  // 4. Voice Tools
  { id: 401, title: 'Text to Speech', slug: 'text-to-speech', description: 'Convert written text into natural-sounding speech with various voices and accents.', category: 'Voice Tools', icon: Mic, isNew: true },
  { id: 402, title: 'Speech to Text', slug: 'speech-to-text', description: 'Transcribe live audio or upload audio files to convert speech into editable text.', category: 'Voice Tools', icon: Mic, isNew: true },
];

export const categories = ['All', 'PDF Tools', 'Image Tools', 'Editor Tools', 'Voice Tools'];

export const CATEGORY_SLUG_MAP: Record<string, string> = {
  all: 'All',
  pdf: 'PDF Tools',
  'pdf-tools': 'PDF Tools',
  image: 'Image Tools',
  'image-tools': 'Image Tools',
  editor: 'Editor Tools',
  'editor-tools': 'Editor Tools',
  voice: 'Voice Tools',
  'voice-tools': 'Voice Tools',
};

export const CATEGORY_TO_SLUG: Record<string, string> = {
  All: 'all',
  'PDF Tools': 'pdf-tools',
  'Image Tools': 'image-tools',
  'Editor Tools': 'editor-tools',
  'Voice Tools': 'voice-tools',
};

export function resolveCategoryName(candidate?: string | null): string | null {
  if (!candidate) return null;
  const clean = candidate.toLowerCase().trim();
  if (CATEGORY_SLUG_MAP[clean]) return CATEGORY_SLUG_MAP[clean];
  if (categories.includes(candidate)) return candidate;
  return null;
}

interface ToolsSectionProps {
  isStandalone?: boolean;
  initialCategory?: string;
}

const ToolsSection = ({ isStandalone = false, initialCategory }: ToolsSectionProps) => {
  const router = useRouter();

  const [activeCategory, setActiveCategory] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const queryCat = resolveCategoryName(params.get('category') || params.get('tab'));
      if (queryCat) return queryCat;
      const storedCat = resolveCategoryName(sessionStorage.getItem('convertify_active_tools_category'));
      if (storedCat) return storedCat;
    }
    return resolveCategoryName(initialCategory) || 'All';
  });

  // Sync category on mount and when browser back/forward buttons are clicked
  useEffect(() => {
    const syncCategoryFromLocation = () => {
      if (typeof window === 'undefined') return;

      // 1. Check URL query params (?category=editor-tools or ?tab=Editor Tools)
      const params = new URLSearchParams(window.location.search);
      const queryCat = resolveCategoryName(params.get('category') || params.get('tab'));
      if (queryCat) {
        setActiveCategory(queryCat);
        sessionStorage.setItem('convertify_active_tools_category', queryCat);
        return;
      }

      // 2. Check initialCategory prop (from route /tools/[category])
      const propCat = resolveCategoryName(initialCategory);
      if (propCat) {
        setActiveCategory(propCat);
        sessionStorage.setItem('convertify_active_tools_category', propCat);
        return;
      }

      // 3. Check sessionStorage (when user visited a tool and pressed browser Back)
      const storedCat = resolveCategoryName(sessionStorage.getItem('convertify_active_tools_category'));
      if (storedCat) {
        setActiveCategory(storedCat);
        return;
      }

      setActiveCategory('All');
    };

    syncCategoryFromLocation();

    window.addEventListener('popstate', syncCategoryFromLocation);
    return () => window.removeEventListener('popstate', syncCategoryFromLocation);
  }, [initialCategory]);

  const filteredTools = activeCategory === 'All' ? toolsData : toolsData.filter((tool) => tool.category === activeCategory);

  const playClick = () => window.soundManager?.playClick();

  const handleCategorySelect = (category: string) => {
    setActiveCategory(category);
    playClick();

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('convertify_active_tools_category', category);

      const slug = CATEGORY_TO_SLUG[category] || 'all';
      const url = new URL(window.location.href);
      if (slug === 'all') {
        url.searchParams.delete('category');
      } else {
        url.searchParams.set('category', slug);
      }
      window.history.replaceState({}, '', url.toString());
    }
  };

  const handleToolClick = (tool: ToolDef) => {
    playClick();
    if (tool.slug) {
      const targetCategory = activeCategory !== 'All' ? activeCategory : tool.category;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('convertify_active_tools_category', targetCategory);
      }
      const catSlug = CATEGORY_TO_SLUG[targetCategory] || 'all';
      router.push(`/tools/${catSlug}/${tool.slug}`);
    }
  };

  return (
    <div className={`tools-section ${isStandalone ? 'standalone' : ''}`}>
      <div className="tools-container">
        <div className="tools-filters-container">
          <div className="tools-filters">
            {categories.map((category) => (
              <button
                key={category}
                className={`tools-filter-btn ${activeCategory === category ? 'active' : ''}`}
                onClick={() => handleCategorySelect(category)}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="tools-grid">
          {filteredTools.map((tool) => {
            const Icon = tool.icon;
            return (
              <div
                key={tool.id}
                className="tool-card"
                onClick={() => handleToolClick(tool)}
              >
                <div className="tool-icon-box">
                  <Icon size={18} color="var(--color-3)" />
                </div>
                <h3 className="tool-card-title">{tool.title}</h3>
                <p className="tool-card-desc">{tool.description}</p>
                <div className="tool-card-footer">
                  Use Tool <span className="arrow">&rarr;</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ToolsSection;
