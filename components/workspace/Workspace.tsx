'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import './Workspace.css';
import FileCard, { type FileCardData } from '@/components/tools/FileCard';
import {
  Layers,
  Star,
  Clock,
  Folder,
  Trash2,
  Search,
  ChevronDown,
  Grid,
  List,
  X,
  Pin,
  Download,
  FolderPlus,
  RefreshCcw,
  UploadCloud,
  CheckSquare,
  Menu,
  type LucideIcon,
} from 'lucide-react';
import { Modal } from 'antd';
import { message } from '@/utils/message';
import { api } from '@/utils/apiClient';
import UploadModal from '@/components/tools/UploadModal';
import FilePreviewModal from '@/components/tools/FilePreviewModal';
import { setSuccessFile } from '@/utils/successHandoff';

interface WorkspaceFile {
  _id: string;
  originalName: string;
  filename: string;
  createdAt: string;
  mimetype?: string;
  size: number;
  isStarred?: boolean;
  isPinned?: boolean;
  isDeleted?: boolean;
  isExpired?: boolean;
  projectId?: string | null;
}

interface WorkspaceProject {
  _id: string;
  name: string;
  createdAt: string;
}

interface ContextMenuState {
  x: number;
  y: number;
  fileId: string;
  file: FileCardData;
}

interface CurrentFolder {
  type: 'smart' | 'custom';
  id: string;
  name: string;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getIconData = (mimetype?: string) => {
  if (!mimetype) return { type: 'File', color: '100, 116, 139' };
  if (mimetype.includes('pdf')) return { type: 'PDF', color: '239, 68, 68' };
  if (mimetype.includes('image')) return { type: 'IMG', color: '139, 92, 246' };
  if (mimetype.includes('video')) return { type: 'VID', color: '14, 165, 233' };
  if (mimetype.includes('audio')) return { type: 'AUD', color: '236, 72, 153' };
  if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) return { type: 'X', color: '16, 185, 129' };
  if (mimetype.includes('powerpoint') || mimetype.includes('presentation')) return { type: 'P', color: '249, 115, 22' };
  if (mimetype.includes('word') || mimetype.includes('wordprocessing') || mimetype.includes('document')) return { type: 'W', color: '59, 130, 246' };
  return { type: 'File', color: '100, 116, 139' };
};

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) => (
  <div className={`sidebar-item ${active ? 'active' : ''}`} onClick={onClick}>
    <Icon size={18} className="sidebar-icon" />
    <span>{label}</span>
  </div>
);

const Workspace = () => {
  const [sidebarActive, setSidebarActive] = useState('All Files');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [previewFile, setPreviewFile] = useState<FileCardData | null>(null);

  const [isProjectModalVisible, setIsProjectModalVisible] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [currentFolder, setCurrentFolder] = useState<CurrentFolder | null>(null);

  const [sortOption, setSortOption] = useState<'newest' | 'oldest' | 'title_az' | 'title_za'>('newest');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);

  const router = useRouter();

  const playClick = () => window.soundManager?.playClick();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncWorkspaceTab = () => {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      const tabMap: Record<string, string> = {
        all: 'All Files',
        starred: 'Starred',
        recent: 'Recent',
        folders: 'Folders',
        trash: 'Trash',
      };
      if (tabParam && tabMap[tabParam.toLowerCase()]) {
        setSidebarActive(tabMap[tabParam.toLowerCase()]);
        sessionStorage.setItem('convertify_workspace_tab', tabMap[tabParam.toLowerCase()]);
        return;
      }
      const saved = sessionStorage.getItem('convertify_workspace_tab');
      if (saved && Object.values(tabMap).includes(saved)) {
        setSidebarActive(saved);
      }
    };

    syncWorkspaceTab();
    window.addEventListener('popstate', syncWorkspaceTab);
    return () => window.removeEventListener('popstate', syncWorkspaceTab);
  }, []);

  const handleSelectSidebarTab = (tab: string) => {
    setSidebarActive(tab);
    setCurrentFolder(null);
    setSelectedFiles([]);
    setIsMobileSidebarOpen(false);
    playClick();

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('convertify_workspace_tab', tab);
      const slugMap: Record<string, string> = {
        'All Files': 'all',
        'Starred': 'starred',
        'Recent': 'recent',
        'Folders': 'folders',
        'Trash': 'trash',
      };
      const url = new URL(window.location.href);
      const slug = slugMap[tab] || 'all';
      if (slug === 'all') {
        url.searchParams.delete('tab');
      } else {
        url.searchParams.set('tab', slug);
      }
      window.history.replaceState({}, '', url.toString());
    }
  };

  const fetchFiles = async () => {
    try {
      setIsLoading(true);
      const res = await api.getMyFiles();
      setFiles(res.files);
    } catch (err) {
      console.error(err);
      message.error('Failed to load files');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const data = await api.getProjects();
      setProjects(data.projects || []);
    } catch (err) {
      console.error('Failed to fetch projects', err);
    }
  };

  useEffect(() => {
    fetchFiles();
    fetchProjects();
  }, []);

  useEffect(() => {
    const closeMenu = (e: MouseEvent) => {
      setContextMenu(null);
      if (!(e.target as HTMLElement).closest('.sort-dropdown-container')) {
        setIsSortDropdownOpen(false);
      }
    };
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  const filteredFiles = files
    .filter((file) => {
      const query = searchQuery.trim().toLowerCase();
      if (
        query &&
        !file.originalName.toLowerCase().includes(query) &&
        !file.filename.toLowerCase().includes(query)
      ) {
        return false;
      }

      if (sidebarActive === 'Trash') {
        return file.isDeleted === true;
      } else {
        if (file.isDeleted === true) return false;
      }

      if (sidebarActive === 'Folders') {
        if (!currentFolder) {
          // With no folder open, fall through to a flat search-results list
          // instead of the empty result the Smart Folders tile view expects.
          if (query) return true;
          return false;
        }

        if (currentFolder.type === 'smart') {
          const mime = file.mimetype || '';
          if (currentFolder.id === 'images' && !mime.startsWith('image/')) return false;
          if (currentFolder.id === 'pdfs' && mime !== 'application/pdf') return false;
          if (currentFolder.id === 'documents' && !mime.includes('word') && !mime.includes('text')) return false;
        } else if (currentFolder.type === 'custom') {
          if (file.projectId !== currentFolder.id) return false;
        }
        return true;
      }

      if (sidebarActive === 'Starred' && !file.isStarred) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      if (sortOption === 'newest') {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      } else if (sortOption === 'oldest') {
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      } else if (sortOption === 'title_az') {
        return (a.originalName || a.filename || '').localeCompare(b.originalName || b.filename || '');
      } else if (sortOption === 'title_za') {
        return (b.originalName || b.filename || '').localeCompare(a.originalName || a.filename || '');
      }

      return 0;
    });

  const handleSelectFile = (id: string) => {
    setSelectedFiles((prev) => (prev.includes(id) ? prev.filter((fid) => fid !== id) : [...prev, id]));
  };

  const handleBulkDownload = async () => {
    playClick();
    if (selectedFiles.length === 0) return;
    try {
      message.loading({ content: 'Preparing download...', key: 'bulk-download' });
      const { blob, warnings } = await api.bulkDownloadFiles(selectedFiles);

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Bulk_Download_${Date.now()}.zip`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      if (warnings > 0) {
        message.warning({ content: `Downloaded, but ${warnings} file(s) were skipped (see errors.txt in the zip).`, key: 'bulk-download' });
      } else {
        message.success({ content: 'Download complete!', key: 'bulk-download' });
      }
    } catch (err) {
      message.error({ content: (err instanceof Error && err.message) || 'Bulk download failed', key: 'bulk-download' });
    }
  };

  const handleBulkAction = async (action: string) => {
    if (action !== 'unselect' && selectedFiles.length === 0) return;
    try {
      message.loading({ content: `Applying ${action}...`, key: 'bulk' });
      if (action !== 'unselect') {
        await api.performBulkAction(action, selectedFiles);
      }
      message.success({ content: 'Action successful!', key: 'bulk' });
      setSelectedFiles([]);
      setIsSelectionMode(false);
      setCurrentFolder(null);
      if (action !== 'unselect') {
        fetchFiles();
      }
    } catch {
      message.error({ content: 'Failed to apply action', key: 'bulk' });
    }
  };

  const confirmBulkDelete = (action: 'delete' | 'permanent-delete') => {
    const count = selectedFiles.length;
    if (count === 0) return;
    const isPermanent = action === 'permanent-delete';
    Modal.confirm({
      title: isPermanent
        ? `Permanently delete ${count} file${count > 1 ? 's' : ''}?`
        : `Move ${count} file${count > 1 ? 's' : ''} to Trash?`,
      content: isPermanent
        ? 'This cannot be undone.'
        : 'You can restore these from Trash later.',
      okText: isPermanent ? 'Delete Forever' : 'Move to Trash',
      okButtonProps: { danger: isPermanent },
      cancelText: 'Cancel',
      onOk: () => handleBulkAction(action),
    });
  };

  const confirmClearHistory = () => {
    const isTrash = sidebarActive === 'Trash';
    Modal.confirm({
      title: isTrash ? 'Permanently delete everything in Trash?' : 'Move all visible files to Trash?',
      content: isTrash ? 'This cannot be undone.' : 'You can restore these from Trash later.',
      okText: isTrash ? 'Empty Trash' : 'Clear History',
      okButtonProps: { danger: isTrash },
      cancelText: 'Cancel',
      onOk: () => {
        playClick();
        handleClearHistory();
      },
    });
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      message.loading({ content: 'Creating project...', key: 'proj' });
      const res = await api.createProject(newProjectName);

      if (selectedFiles.length > 0) {
        await api.performBulkAction('project', selectedFiles, res.project._id);
        message.success({ content: `Project created and ${selectedFiles.length} files moved!`, key: 'proj' });
      } else {
        message.success({ content: 'Project created!', key: 'proj' });
      }

      setNewProjectName('');
      setIsProjectModalVisible(false);
      setSelectedFiles([]);
      setIsSelectionMode(false);
      fetchProjects();
      fetchFiles();
    } catch {
      message.error({ content: 'Failed to create project', key: 'proj' });
    }
  };

  const handleClearHistory = async () => {
    try {
      message.loading({ content: 'Emptying...', key: 'clear' });
      if (sidebarActive === 'Trash') {
        await api.emptyTrash();
      } else {
        const visibleIds = filteredFiles.map((f) => f._id);
        if (visibleIds.length > 0) {
          await api.performBulkAction('delete', visibleIds);
        }
      }
      message.success({ content: 'Action successful!', key: 'clear' });
      fetchFiles();
    } catch {
      message.error({ content: 'Failed action', key: 'clear' });
    }
  };

  const handleUploadClick = () => {
    playClick();
    if (sidebarActive === 'Folders') {
      setIsProjectModalVisible(true);
    } else {
      setIsUploadModalOpen(true);
    }
  };

  const handleUploadSuccess = (response: { file: Record<string, unknown> }) => {
    setIsUploadModalOpen(false);
    setSuccessFile(response.file as never);
    router.push('/success');
  };

  return (
    <div className="workspace-container">
      {isMobileSidebarOpen && <div className="mobile-sidebar-overlay" onClick={() => setIsMobileSidebarOpen(false)}></div>}

      <aside className={`workspace-sidebar ${isMobileSidebarOpen ? 'open' : ''}`}>
        <div className="workspace-sidebar-header">
          <div className="sidebar-brand">
            <Layers size={20} color="var(--color-3)" />
            <span className="sidebar-brand-title">Workspace</span>
          </div>
          <button className="sidebar-close-btn" onClick={() => setIsMobileSidebarOpen(false)} aria-label="Close sidebar">
            <X size={18} />
          </button>
        </div>

        <h3 className="sidebar-title">Categories</h3>
        <SidebarItem
          icon={Layers}
          label="All Files"
          active={sidebarActive === 'All Files'}
          onClick={() => handleSelectSidebarTab('All Files')}
        />
        <SidebarItem
          icon={Star}
          label="Starred"
          active={sidebarActive === 'Starred'}
          onClick={() => handleSelectSidebarTab('Starred')}
        />
        <SidebarItem
          icon={Clock}
          label="Recent"
          active={sidebarActive === 'Recent'}
          onClick={() => handleSelectSidebarTab('Recent')}
        />
        <SidebarItem
          icon={Folder}
          label="Folders / Projects"
          active={sidebarActive === 'Folders'}
          onClick={() => handleSelectSidebarTab('Folders')}
        />

        <h3 className="sidebar-title mt-4">System</h3>
        <SidebarItem
          icon={Trash2}
          label="Trash / Deleted"
          active={sidebarActive === 'Trash'}
          onClick={() => handleSelectSidebarTab('Trash')}
        />
      </aside>

      <div className="workspace-main">
        <div className="workspace-main-header">
          <button className="mobile-sidebar-toggle" onClick={() => setIsMobileSidebarOpen(true)}>
            <Menu size={24} />
          </button>
          <h2 className="workspace-title">{sidebarActive}</h2>
        </div>
        <div className="workspace-top-bar">
          <div className="search-bar-wrapper">
            <Search
              className="search-icon"
              size={18}
              style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(26,11,46,0.4)' }}
            />
            <input
              type="text"
              className="search-input"
              placeholder="Search files, projects..."
              style={{ paddingLeft: '2.8rem', paddingRight: searchQuery ? '2.5rem' : undefined }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="filters-row" style={{ justifyContent: 'flex-end' }}>
            <div className="dropdown-filters">
              <div className="sort-dropdown-container" style={{ position: 'relative' }}>
                <button
                  className="dropdown-btn"
                  onClick={() => {
                    playClick();
                    setIsSortDropdownOpen(!isSortDropdownOpen);
                  }}
                >
                  Sort <ChevronDown size={14} />
                </button>
                {isSortDropdownOpen && (
                  <div className="sort-dropdown-menu">
                    <button
                      className={`sort-option ${sortOption === 'newest' ? 'active' : ''}`}
                      onClick={() => {
                        playClick();
                        setSortOption('newest');
                        setIsSortDropdownOpen(false);
                      }}
                    >
                      Date (Newest to Oldest)
                    </button>
                    <button
                      className={`sort-option ${sortOption === 'oldest' ? 'active' : ''}`}
                      onClick={() => {
                        playClick();
                        setSortOption('oldest');
                        setIsSortDropdownOpen(false);
                      }}
                    >
                      Date (Oldest to Newest)
                    </button>
                    <button
                      className={`sort-option ${sortOption === 'title_az' ? 'active' : ''}`}
                      onClick={() => {
                        playClick();
                        setSortOption('title_az');
                        setIsSortDropdownOpen(false);
                      }}
                    >
                      Title (A to Z)
                    </button>
                    <button
                      className={`sort-option ${sortOption === 'title_za' ? 'active' : ''}`}
                      onClick={() => {
                        playClick();
                        setSortOption('title_za');
                        setIsSortDropdownOpen(false);
                      }}
                    >
                      Title (Z to A)
                    </button>
                  </div>
                )}
              </div>
              <button
                className={`view-toggle ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => {
                  playClick();
                  setViewMode('grid');
                }}
              >
                <Grid size={16} />
              </button>
              <button
                className={`view-toggle ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => {
                  playClick();
                  setViewMode('list');
                }}
                style={{ marginLeft: '4px' }}
              >
                <List size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="selection-bar-container">
          {selectedFiles.length > 0 && (
            <div className="selection-bar">
              <div className="selection-info">
                <button className="close-selection-btn" onClick={() => handleBulkAction('unselect')} title="Clear selection">
                  <X size={16} strokeWidth={2.5} />
                </button>
                <span>
                  {selectedFiles.length} item{selectedFiles.length > 1 ? 's' : ''} selected
                </span>
              </div>
              <div className="selection-actions">
                {sidebarActive === 'Trash' ? (
                  <>
                    <button className="selection-icon-btn" onClick={() => handleBulkAction('restore')} title="Restore Selected">
                      <RefreshCcw size={18} />
                    </button>
                    <button className="selection-icon-btn danger" onClick={() => confirmBulkDelete('permanent-delete')} title="Delete Forever">
                      <Trash2 size={18} />
                    </button>
                  </>
                ) : (
                  <>
                    <button className="selection-icon-btn" onClick={() => handleBulkAction('pin')} title="Pin Selected">
                      <Pin size={18} />
                    </button>
                    <button className="selection-icon-btn" onClick={() => handleBulkAction('star')} title="Star Selected">
                      <Star size={18} />
                    </button>
                    <button
                      className="selection-icon-btn"
                      onClick={() => {
                        playClick();
                        setIsProjectModalVisible(true);
                      }}
                      title="Create Folder from Selected"
                    >
                      <FolderPlus size={18} />
                    </button>
                    <button className="selection-icon-btn" onClick={handleBulkDownload} title="Download Selected">
                      <Download size={18} />
                    </button>
                    <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.3)', margin: '0 8px' }}></div>
                    <button className="selection-icon-btn danger" onClick={() => confirmBulkDelete('delete')} title="Delete Selected">
                      <Trash2 size={18} />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="action-bar">
          {sidebarActive === 'Folders' ? (
            <button
              className="action-btn primary"
              onClick={() => {
                playClick();
                setIsProjectModalVisible(true);
              }}
            >
              <FolderPlus size={16} />
              New Folder
            </button>
          ) : (
            <button className="action-btn primary" onClick={handleUploadClick}>
              <UploadCloud size={16} />
              Upload File
            </button>
          )}

          <button
            className={`action-btn secondary ${isSelectionMode ? 'active' : ''}`}
            onClick={() => {
              playClick();
              setIsSelectionMode(!isSelectionMode);
            }}
          >
            <CheckSquare size={16} /> {isSelectionMode ? 'Cancel Selection' : 'Select'}
          </button>

          <button
            className="action-btn danger"
            onClick={() => {
              playClick();
              confirmClearHistory();
            }}
          >
            <Trash2 size={16} /> {sidebarActive === 'Trash' ? 'Empty Trash' : 'Clear History'}
          </button>
        </div>

        {sidebarActive === 'Folders' && !currentFolder && !searchQuery.trim() ? (
          <div className="folders-view">
            <h3 className="section-title" style={{ fontSize: '1.1rem', color: 'var(--color-1)', marginBottom: '1rem' }}>
              Smart Folders
            </h3>
            <div className="file-grid" style={{ marginBottom: '3rem' }}>
              {[
                { id: 'images', name: 'Images', color: 'rgb(245, 158, 11)' },
                { id: 'pdfs', name: 'PDFs', color: 'rgb(239, 68, 68)' },
                { id: 'documents', name: 'Documents', color: 'rgb(59, 130, 246)' },
              ].map((sf) => (
                <div
                  key={sf.id}
                  className="file-card folder-card"
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    playClick();
                    setCurrentFolder({ type: 'smart', id: sf.id, name: sf.name });
                  }}
                >
                  <div className="card-header" style={{ marginBottom: 0 }}>
                    <div className="card-title-area">
                      <div className="file-icon" style={{ background: sf.color.replace('rgb', 'rgba').replace(')', ', 0.15)') }}>
                        <Folder size={20} color={sf.color} fill={sf.color} fillOpacity={0.2} />
                      </div>
                      <div className="file-info">
                        <h4 className="file-name">{sf.name}</h4>
                        <p className="file-time">Auto-categorized</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 className="section-title" style={{ fontSize: '1.1rem', color: 'var(--color-1)', margin: 0 }}>
                My Projects
              </h3>
            </div>
            <div className="file-grid">
              {projects.length === 0 ? (
                <div style={{ padding: '2rem', color: '#64748b', gridColumn: '1 / -1' }}>
                  No projects created yet. Select files and click the Folder icon to create one.
                </div>
              ) : (
                projects.map((p) => (
                  <div
                    key={p._id}
                    className="file-card folder-card"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      playClick();
                      setCurrentFolder({ type: 'custom', id: p._id, name: p.name });
                    }}
                  >
                    <div className="card-header" style={{ marginBottom: 0 }}>
                      <div className="card-title-area">
                        <div className="file-icon" style={{ background: 'rgba(123, 49, 131, 0.15)' }}>
                          <Folder size={20} color="var(--color-3)" fill="var(--color-3)" fillOpacity={0.2} />
                        </div>
                        <div className="file-info">
                          <h4 className="file-name">{p.name}</h4>
                          <p className="file-time">{new Date(p.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <>
            {currentFolder && (
              <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button
                  className="action-btn secondary"
                  onClick={() => {
                    playClick();
                    setCurrentFolder(null);
                  }}
                  style={{ width: 'auto', padding: '0.5rem 1rem' }}
                >
                  &larr; Back to Folders
                </button>
                <h3 style={{ margin: 0, color: 'var(--color-1)' }}>{currentFolder.name}</h3>
              </div>
            )}
            <div className={`file-grid ${viewMode === 'list' ? 'list-view' : ''}`}>
              {viewMode === 'list' && filteredFiles.length > 0 && (
                <div className="list-view-header">
                  <div className="col-name">Name</div>
                  <div className="col-date">Uploaded At</div>
                  <div className="col-size">Size</div>
                  <div className="col-actions"></div>
                </div>
              )}

              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton-card">
                    <div className="skeleton-icon" />
                    <div className="skeleton-lines">
                      <div className="skeleton-line" style={{ width: '70%' }} />
                      <div className="skeleton-line" style={{ width: '40%' }} />
                    </div>
                  </div>
                ))
              ) : filteredFiles.length > 0 ? (
                filteredFiles.map((file) => {
                  const iconData = getIconData(file.mimetype);
                  const cardData: FileCardData = {
                    id: file._id,
                    name: file.originalName && file.originalName.trim() ? file.originalName : file.filename || 'Untitled File',
                    filename: file.filename,
                    time: file.createdAt,
                    iconType: iconData.type,
                    iconColor: iconData.color,
                    size: formatBytes(file.size),
                    status: 'ready',
                    isStarred: file.isStarred || false,
                    isPinned: file.isPinned || false,
                    isDeleted: file.isDeleted || false,
                    isExpired: file.isExpired || false,
                    mimetype: file.mimetype || '',
                  };
                  return (
                    <FileCard
                      key={file._id}
                      data={cardData}
                      viewMode={viewMode}
                      isSelectionMode={isSelectionMode}
                      isSelected={selectedFiles.includes(file._id)}
                      onSelect={() => handleSelectFile(file._id)}
                      onPreview={() => setPreviewFile(cardData)}
                      onToggleState={async (updates) => {
                        await api.toggleFileState(file._id, updates);
                        fetchFiles();
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({ x: e.clientX, y: e.clientY, fileId: file._id, file: cardData });
                      }}
                    />
                  );
                })
              ) : (
                <div className="workspace-empty-state">
                  <svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg" className="empty-state-illustration">
                    <rect x="8" y="28" width="104" height="60" rx="10" fill="var(--color-4)" fillOpacity="0.12" />
                    <path
                      d="M8 38C8 32.4772 12.4772 28 18 28H42.5L52.5 38H102C107.523 38 112 42.4772 112 48V78C112 83.5228 107.523 88 102 88H18C12.4772 88 8 83.5228 8 78V38Z"
                      fill="var(--color-4)"
                      fillOpacity="0.22"
                    />
                    <path
                      d="M8 38C8 32.4772 12.4772 28 18 28H42.5L52.5 38H102C107.523 38 112 42.4772 112 48V78C112 83.5228 107.523 88 102 88H18C12.4772 88 8 83.5228 8 78V38Z"
                      stroke="var(--color-3)"
                      strokeWidth="2"
                    />
                    <circle cx="88" cy="20" r="5" fill="var(--color-5)" />
                    <circle cx="100" cy="12" r="3" fill="var(--color-4)" />
                    <path d="M40 58L52 70M52 58L40 70" stroke="var(--color-3)" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  <h3>No files found</h3>
                  <p>Try adjusting your filters or upload a new file.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {isProjectModalVisible && (
        <div
          className="modal-overlay"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}
        >
          <div className="modal-content" style={{ background: 'white', padding: '2rem', borderRadius: '16px', width: '400px', maxWidth: '90%', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--color-1)' }}>Create New Folder</h3>
            <input
              type="text"
              placeholder="e.g., Q1 Invoices"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              autoFocus
              style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.1)', marginBottom: '1.5rem', fontSize: '1rem' }}
            />
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button className="action-btn secondary" onClick={() => setIsProjectModalVisible(false)} style={{ padding: '0.75rem 1.5rem', flex: 0 }}>
                Cancel
              </button>
              <button className="action-btn primary" onClick={handleCreateProject} disabled={!newProjectName.trim()} style={{ padding: '0.75rem 1.5rem', flex: 0 }}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      <UploadModal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)} onSuccess={handleUploadSuccess} />
      {previewFile && <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}
      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          <div
            className="context-menu-item"
            onClick={async () => {
              const f = contextMenu.file;
              if (f.isExpired) {
                message.error('This file has expired and is no longer available for download.');
              } else {
                message.loading({ content: 'Downloading...', key: 'download' });
                try {
                  await api.downloadFile(f.filename, f.name);
                  message.success({ content: 'Download complete!', key: 'download' });
                } catch (err) {
                  message.error({ content: (err instanceof Error && err.message) || 'Failed to download file', key: 'download' });
                }
              }
              setContextMenu(null);
            }}
          >
            <Download size={16} /> Download
          </div>
          <div className="context-menu-divider"></div>
          <div
            className="context-menu-item danger"
            onClick={() => {
              const { fileId, file } = contextMenu;
              setContextMenu(null);
              Modal.confirm({
                title: `Move "${file.name}" to Trash?`,
                content: 'You can restore this from Trash later.',
                okText: 'Move to Trash',
                cancelText: 'Cancel',
                onOk: async () => {
                  try {
                    await api.performBulkAction('delete', [fileId]);
                    fetchFiles();
                    message.success('File moved to trash');
                  } catch {
                    message.error('Failed to delete file');
                  }
                },
              });
            }}
          >
            <Trash2 size={16} /> Delete File
          </div>
        </div>
      )}
    </div>
  );
};

export default Workspace;
