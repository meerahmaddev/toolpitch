'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Grid, LogOut, Menu, X, ChevronRight, Settings, Search, Wrench } from 'lucide-react';
import ToolIcon from '@/components/tools/ToolIcon';
import { useAuthModal } from '@/context/AuthModalContext';
import { useAuth } from '@/hooks/useAuth';
import { resolveCategoryName, CATEGORY_TO_SLUG } from '@/components/home/ToolsSection';
import './Header.css';

// Image Tool Categories
const imageConversionItems = [
  { name: 'JPG to PNG', slug: 'jpg-to-png', type: 'IMG', color: '#14b8a6' },
  { name: 'JPG to WEBP', slug: 'jpg-to-webp', type: 'IMG', color: '#14b8a6' },
  { name: 'PNG to JPG', slug: 'png-to-jpg', type: 'IMG', color: '#14b8a6' },
  { name: 'PNG to WEBP', slug: 'png-to-webp', type: 'IMG', color: '#14b8a6' },
  { name: 'WEBP to JPG', slug: 'webp-to-jpg', type: 'IMG', color: '#14b8a6' },
  { name: 'WEBP to PNG', slug: 'webp-to-png', type: 'IMG', color: '#14b8a6' },
  { name: 'HEIC to JPG', slug: 'heic-to-jpg', type: 'IMG', color: '#14b8a6' },
  { name: 'HEIC to PNG', slug: 'heic-to-png', type: 'IMG', color: '#14b8a6' },
  { name: 'HEIC to WEBP', slug: 'heic-to-webp', type: 'IMG', color: '#14b8a6' },
  { name: 'SVG to JPG', slug: 'svg-to-jpg', type: 'IMG', color: '#14b8a6' },
  { name: 'SVG to PNG', slug: 'svg-to-png', type: 'IMG', color: '#14b8a6' },
  { name: 'SVG to WEBP', slug: 'svg-to-webp', type: 'IMG', color: '#14b8a6' },
];

const imageOptimizeItems = [
  { name: 'Image Compressor', slug: 'image-compressor', type: 'Compress', color: '#ef4444', desc: 'Reduce file size without quality loss' },
  { name: 'Images to PDF', slug: 'images-to-pdf', type: 'JPG', color: '#eab308', desc: 'Convert JPG, PNG, WEBP to PDF document' },
];

// PDF Tool Categories
const pdfGroups = [
  {
    title: 'CONVERT TO PDF',
    items: [
      { name: 'Word to PDF', slug: 'word-to-pdf', type: 'W', color: '#3b82f6' },
      { name: 'Excel to PDF', slug: 'excel-to-pdf', type: 'X', color: '#10b981' },
      { name: 'PPT to PDF', slug: 'ppt-to-pdf', type: 'P', color: '#f97316' },
      { name: 'Images to PDF', slug: 'images-to-pdf', type: 'JPG', color: '#eab308' },
      { name: 'TXT to PDF', slug: 'txt-to-pdf', type: 'TXT', color: '#64748b' },
    ],
  },
  {
    title: 'CONVERT FROM PDF',
    items: [
      { name: 'PDF to Word', slug: 'pdf-to-word', type: 'W', color: '#3b82f6' },
      { name: 'PDF to Excel', slug: 'pdf-to-excel', type: 'X', color: '#10b981' },
      { name: 'PDF to PowerPoint', slug: 'pdf-to-ppt', type: 'P', color: '#f97316' },
    ],
  },
  {
    title: 'ORGANIZE & COMPRESS',
    items: [
      { name: 'Merge PDF', slug: 'merge-pdf', type: 'Merge', color: '#8b5cf6' },
      { name: 'Split PDF', slug: 'split-pdf', type: 'Split', color: '#8b5cf6' },
      { name: 'Compress PDF', slug: 'compress-pdf', type: 'Compress', color: '#ef4444' },
      { name: 'Edit PDF', slug: 'edit-pdf', type: 'Edit', color: '#8b5cf6' },
    ],
  },
];

// Voice Items
const voiceItems = [
  { name: 'Text to Speech', slug: 'text-to-speech', type: 'Speaker', color: '#0ea5e9', desc: 'Turn written text into natural lifelike AI speech' },
  { name: 'Speech to Text', slug: 'speech-to-text', type: 'Mic', color: '#0ea5e9', desc: 'Transcribe recordings and voice into accurate text' },
];

// Editor Items
const editorItems = [
  { name: 'Edit PDF', slug: 'edit-pdf', type: 'Edit', color: '#8b5cf6', desc: 'Edit text, replace fonts & reflow content' },
  { name: 'Image Compressor', slug: 'image-compressor', type: 'Compress', color: '#ef4444', desc: 'Smart image optimization' },
];

// Mobile drawer categorized sections
const mobileColumns = [
  {
    title: 'IMAGE TOOLS',
    categorySlug: 'image-tools',
    items: [
      { name: 'JPG to PNG', slug: 'jpg-to-png', type: 'IMG', color: '#14b8a6' },
      { name: 'JPG to WEBP', slug: 'jpg-to-webp', type: 'IMG', color: '#14b8a6' },
      { name: 'PNG to JPG', slug: 'png-to-jpg', type: 'IMG', color: '#14b8a6' },
      { name: 'PNG to WEBP', slug: 'png-to-webp', type: 'IMG', color: '#14b8a6' },
      { name: 'WEBP to JPG', slug: 'webp-to-jpg', type: 'IMG', color: '#14b8a6' },
      { name: 'WEBP to PNG', slug: 'webp-to-png', type: 'IMG', color: '#14b8a6' },
      { name: 'HEIC to JPG', slug: 'heic-to-jpg', type: 'IMG', color: '#14b8a6' },
      { name: 'HEIC to PNG', slug: 'heic-to-png', type: 'IMG', color: '#14b8a6' },
      { name: 'HEIC to WEBP', slug: 'heic-to-webp', type: 'IMG', color: '#14b8a6' },
      { name: 'SVG to JPG', slug: 'svg-to-jpg', type: 'IMG', color: '#14b8a6' },
      { name: 'SVG to PNG', slug: 'svg-to-png', type: 'IMG', color: '#14b8a6' },
      { name: 'SVG to WEBP', slug: 'svg-to-webp', type: 'IMG', color: '#14b8a6' },
      { name: 'Image Compressor', slug: 'image-compressor', type: 'Compress', color: '#ef4444' },
    ],
  },
  {
    title: 'PDF TOOLS',
    categorySlug: 'pdf-tools',
    items: [
      { name: 'Word to PDF', slug: 'word-to-pdf', type: 'W', color: '#3b82f6' },
      { name: 'Excel to PDF', slug: 'excel-to-pdf', type: 'X', color: '#10b981' },
      { name: 'PPT to PDF', slug: 'ppt-to-pdf', type: 'P', color: '#f97316' },
      { name: 'Images to PDF', slug: 'images-to-pdf', type: 'JPG', color: '#eab308' },
      { name: 'TXT to PDF', slug: 'txt-to-pdf', type: 'TXT', color: '#64748b' },
      { name: 'PDF to Word', slug: 'pdf-to-word', type: 'W', color: '#3b82f6' },
      { name: 'PDF to Excel', slug: 'pdf-to-excel', type: 'X', color: '#10b981' },
      { name: 'PDF to PowerPoint', slug: 'pdf-to-ppt', type: 'P', color: '#f97316' },
      { name: 'Merge PDF', slug: 'merge-pdf', type: 'Merge', color: '#8b5cf6' },
      { name: 'Split PDF', slug: 'split-pdf', type: 'Split', color: '#8b5cf6' },
      { name: 'Compress PDF', slug: 'compress-pdf', type: 'Compress', color: '#ef4444' },
      { name: 'Edit PDF', slug: 'edit-pdf', type: 'Edit', color: '#8b5cf6' },
    ],
  },
  {
    title: 'VOICE & AI TOOLS',
    categorySlug: 'voice-tools',
    items: [
      { name: 'Text to Speech', slug: 'text-to-speech', type: 'Speaker', color: '#0ea5e9' },
      { name: 'Speech to Text', slug: 'speech-to-text', type: 'Mic', color: '#0ea5e9' },
    ],
  },
  {
    title: 'EDITOR TOOLS',
    categorySlug: 'editor-tools',
    items: [
      { name: 'Edit PDF', slug: 'edit-pdf', type: 'Edit', color: '#8b5cf6' },
      { name: 'Image Compressor', slug: 'image-compressor', type: 'Compress', color: '#ef4444' },
    ],
  },
];

const getToolCategorySlug = (slug: string, fallbackCategory?: string): string => {
  if (fallbackCategory) {
    const resolved = resolveCategoryName(fallbackCategory);
    if (resolved && CATEGORY_TO_SLUG[resolved]) {
      return CATEGORY_TO_SLUG[resolved];
    }
  }
  if (slug === 'image-compressor' || slug === 'edit-pdf') return 'editor-tools';
  if (['text-to-speech', 'speech-to-text'].includes(slug)) return 'voice-tools';
  if (slug.includes('pdf')) return 'pdf-tools';
  return 'image-tools';
};

const allToolsFlat = [
  ...imageConversionItems.map((i) => ({ ...i, category: 'IMAGE CONVERSION' })),
  ...imageOptimizeItems.map((i) => ({ ...i, category: 'IMAGE OPTIMIZATION' })),
  ...pdfGroups.flatMap((g) => g.items.map((i) => ({ ...i, category: g.title }))),
  ...voiceItems.map((i) => ({ ...i, category: 'VOICE TOOLS' })),
  ...editorItems.map((i) => ({ ...i, category: 'EDITOR TOOLS' })),
];

const Header = () => {
  const { openAuthModal } = useAuthModal();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [forceCloseMenu, setForceCloseMenu] = useState(false);
  const [mobileSearch, setMobileSearch] = useState('');
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    setIsProfileOpen(false);
    setIsMobileMenuOpen(false);
    router.replace('/');
    openAuthModal('signin');
    window.soundManager?.playClick();
  };

  const handleToolClick = (categorySlug?: string) => {
    window.soundManager?.playClick();
    if (typeof window !== 'undefined' && categorySlug) {
      const catName = resolveCategoryName(categorySlug);
      if (catName) {
        sessionStorage.setItem('convertify_active_tools_category', catName);
      }
    }
    setForceCloseMenu(true);
    setIsMobileMenuOpen(false);
    setMobileSearch('');
  };

  const filteredTools = mobileSearch.trim()
    ? allToolsFlat.filter((t) => t.name.toLowerCase().includes(mobileSearch.toLowerCase()))
    : null;

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <div className="header-left-group">
            {/* Left: Brand Logo */}
            <Link
              href="/"
              className="header-left"
              onClick={() => {
                window.soundManager?.playClick();
                setIsMobileMenuOpen(false);
              }}
              style={{ textDecoration: 'none' }}
            >
              <div className="logo-icon" style={{ display: 'flex', alignItems: 'center' }}>
                <img src="/logo.svg" alt="Convertify" style={{ width: '28px', height: '28px' }} />
              </div>
              <span className="logo-text">Convertify</span>
            </Link>

            {/* Desktop Navigation: Image -> PDF -> Voice -> Editor -> Workspace -> FAQs */}
            <nav className="header-center">
              {/* 1. Image Category Dropdown */}
              <div className="nav-item-wrapper" onMouseLeave={() => setForceCloseMenu(false)}>
                <button
                  className="nav-link nav-dropdown-btn"
                  type="button"
                  onClick={() => window.soundManager?.playClick()}
                >
                  Image
                  <svg className="chevron-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </button>

                <div className={`nav-dropdown-menu dropdown-image ${forceCloseMenu ? 'force-hide' : ''}`}>
                  <div className="dropdown-grid-2col">
                    <div className="dropdown-col">
                      <h5 className="dropdown-col-title">IMAGE CONVERSION</h5>
                      <div className="dropdown-image-grid">
                        {imageConversionItems.map((item, itemIdx) => (
                          <Link key={itemIdx} href={`/tools/image-tools/${item.slug}`} className="dropdown-tool-item" onClick={() => handleToolClick('image-tools')}>
                            <ToolIcon type={item.type} color={item.color} />
                            <span className="dropdown-tool-name">{item.name}</span>
                          </Link>
                        ))}
                      </div>
                    </div>

                    <div className="dropdown-col dropdown-col-side">
                      <h5 className="dropdown-col-title">OPTIMIZATION & PDF</h5>
                      <ul className="dropdown-col-list">
                        {imageOptimizeItems.map((item, itemIdx) => {
                          const catSlug = item.slug === 'images-to-pdf' ? 'pdf-tools' : 'editor-tools';
                          return (
                            <li key={itemIdx}>
                              <Link href={`/tools/${catSlug}/${item.slug}`} className="dropdown-tool-card" onClick={() => handleToolClick(catSlug)}>
                                <ToolIcon type={item.type} color={item.color} />
                                <div className="dropdown-card-details">
                                  <span className="dropdown-card-name">{item.name}</span>
                                  <span className="dropdown-card-desc">{item.desc}</span>
                                </div>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. PDF Category Dropdown */}
              <div className="nav-item-wrapper" onMouseLeave={() => setForceCloseMenu(false)}>
                <button
                  className="nav-link nav-dropdown-btn"
                  type="button"
                  onClick={() => window.soundManager?.playClick()}
                >
                  PDF
                  <svg className="chevron-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </button>

                <div className={`nav-dropdown-menu dropdown-pdf ${forceCloseMenu ? 'force-hide' : ''}`}>
                  <div className="dropdown-grid-3col">
                    {pdfGroups.map((group, idx) => (
                      <div key={idx} className="dropdown-col">
                        <h5 className="dropdown-col-title">{group.title}</h5>
                        <ul className="dropdown-col-list">
                          {group.items.map((item, itemIdx) => (
                            <li key={itemIdx}>
                              <Link href={`/tools/pdf-tools/${item.slug}`} className="dropdown-tool-item" onClick={() => handleToolClick('pdf-tools')}>
                                <ToolIcon type={item.type} color={item.color} />
                                <span className="dropdown-tool-name">{item.name}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 3. Voice Category Dropdown */}
              <div className="nav-item-wrapper" onMouseLeave={() => setForceCloseMenu(false)}>
                <button
                  className="nav-link nav-dropdown-btn"
                  type="button"
                  onClick={() => window.soundManager?.playClick()}
                >
                  Voice
                  <svg className="chevron-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </button>

                <div className={`nav-dropdown-menu dropdown-voice ${forceCloseMenu ? 'force-hide' : ''}`}>
                  <div className="dropdown-col">
                    <h5 className="dropdown-col-title">AI VOICE SUITE</h5>
                    <div className="dropdown-cards-list">
                      {voiceItems.map((item, itemIdx) => (
                        <Link key={itemIdx} href={`/tools/voice-tools/${item.slug}`} className="dropdown-tool-card" onClick={() => handleToolClick('voice-tools')}>
                          <ToolIcon type={item.type} color={item.color} />
                          <div className="dropdown-card-details">
                            <span className="dropdown-card-name">{item.name}</span>
                            <span className="dropdown-card-desc">{item.desc}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Editor Category Dropdown */}
              <div className="nav-item-wrapper" onMouseLeave={() => setForceCloseMenu(false)}>
                <button
                  className="nav-link nav-dropdown-btn"
                  type="button"
                  onClick={() => window.soundManager?.playClick()}
                >
                  Editor
                  <svg className="chevron-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </button>

                <div className={`nav-dropdown-menu dropdown-editor ${forceCloseMenu ? 'force-hide' : ''}`}>
                  <div className="dropdown-col">
                    <h5 className="dropdown-col-title">CONTENT & IMAGE EDITORS</h5>
                    <div className="dropdown-cards-list">
                      {editorItems.map((item, itemIdx) => (
                        <Link key={itemIdx} href={`/tools/editor-tools/${item.slug}`} className="dropdown-tool-card" onClick={() => handleToolClick('editor-tools')}>
                          <ToolIcon type={item.type} color={item.color} />
                          <div className="dropdown-card-details">
                            <span className="dropdown-card-name">{item.name}</span>
                            <span className="dropdown-card-desc">{item.desc}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 5. Direct Workspace Link */}
              <Link href="/workspace" className="nav-link" onClick={() => window.soundManager?.playClick()}>
                Workspace
              </Link>

              {/* 6. Direct FAQs Link */}
              <Link href="/faq" className="nav-link" onClick={() => window.soundManager?.playClick()}>
                FAQs
              </Link>
            </nav>
          </div>

          {/* Right: Auth Buttons / Profile & Mobile Trigger */}
          <div className="header-right">
            {user ? (
              <div className="user-profile-container" ref={profileRef}>
                <div className="avatar clickable" onClick={() => setIsProfileOpen(!isProfileOpen)}>
                  {user.username ? user.username.charAt(0).toUpperCase() : 'U'}
                </div>

                {isProfileOpen && (
                  <div className="profile-dropdown">
                    <div className="profile-header">
                      <div className="avatar-large">{user.username ? user.username.charAt(0).toUpperCase() : 'U'}</div>
                      <div className="profile-info">
                        <span className="profile-name">{user.username}</span>
                        <span className="profile-email">{user.email}</span>
                      </div>
                    </div>

                    <div className="profile-menu">
                      <Link href="/workspace" className="profile-item" onClick={() => setIsProfileOpen(false)}>
                        <span className="profile-item-icon"><Grid size={15} /></span>
                        <span className="profile-item-label">Workspace</span>
                        <ChevronRight size={14} className="profile-item-arrow" />
                      </Link>

                      <Link href="/account" className="profile-item" onClick={() => setIsProfileOpen(false)}>
                        <span className="profile-item-icon"><Settings size={15} /></span>
                        <span className="profile-item-label">Account settings</span>
                        <ChevronRight size={14} className="profile-item-arrow" />
                      </Link>

                      <div className="profile-divider"></div>

                      <div className="profile-item logout" onClick={handleLogout}>
                        <span className="profile-item-icon logout-icon"><LogOut size={15} /></span>
                        <span className="profile-item-label">Log out</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="desktop-auth-buttons">
                <button className="btn-login" onClick={() => openAuthModal('signin')}>Log in</button>
                <button className="btn-signup" onClick={() => openAuthModal('signup')}>Sign up</button>
              </div>
            )}

            {/* Mobile Hamburger Button on far right */}
            <button
              className="mobile-menu-btn"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle Navigation Menu"
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      <div className={`mobile-nav-overlay ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="mobile-nav-content">
          {/* Mobile Drawer Auth Header */}
          {!user ? (
            <div className="mobile-auth-actions">
              <button
                className="mobile-btn-login"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  openAuthModal('signin');
                }}
              >
                Log in
              </button>
              <button
                className="mobile-btn-signup"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  openAuthModal('signup');
                }}
              >
                Sign up free
              </button>
            </div>
          ) : (
            <div className="mobile-user-card">
              <div className="mobile-avatar">{user.username ? user.username.charAt(0).toUpperCase() : 'U'}</div>
              <div className="mobile-user-details">
                <span className="mobile-username">{user.username}</span>
                <span className="mobile-useremail">{user.email}</span>
              </div>
              <button
                className="mobile-btn-logout"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleLogout();
                }}
                aria-label="Log out"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}

          {/* Main Navigation Links */}
          <div className="mobile-main-links">
            <Link href="/" className="mobile-nav-link" onClick={() => setIsMobileMenuOpen(false)}>Home</Link>
            <Link href="/workspace" className="mobile-nav-link" onClick={() => setIsMobileMenuOpen(false)}>Workspace</Link>
            <Link href="/faq" className="mobile-nav-link" onClick={() => setIsMobileMenuOpen(false)}>FAQs</Link>
          </div>

          <div className="mobile-nav-divider"></div>

          {/* ALL TOOLS Section Header */}
          <div className="mobile-all-tools-header">
            <Wrench size={16} color="#a78bfa" />
            <span>ALL TOOLS</span>
          </div>

          {/* Live Mobile Search Bar placed right under ALL TOOLS */}
          <div className="mobile-search-container">
            <div className="mobile-search-box">
              <Search size={17} className="mobile-search-icon" />
              <input
                type="text"
                placeholder="Search tools..."
                value={mobileSearch}
                onChange={(e) => setMobileSearch(e.target.value)}
                className="mobile-search-input"
              />
              {mobileSearch && (
                <button
                  type="button"
                  className="mobile-search-clear"
                  onClick={() => setMobileSearch('')}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {filteredTools !== null ? (
            /* Search Results View */
            <div className="mobile-search-results">
              {filteredTools.length > 0 ? (
                <div className="mobile-tools-list">
                  {filteredTools.map((item, idx) => {
                    const catSlug = getToolCategorySlug(item.slug, item.category);
                    return (
                      <Link
                        key={idx}
                        href={`/tools/${catSlug}/${item.slug}`}
                        className="mobile-tool-item"
                        onClick={() => handleToolClick(catSlug)}
                      >
                        <ToolIcon type={item.type} color={item.color} />
                        <span className="mobile-tool-title">{item.name}</span>
                        <span className="mobile-tool-category-badge">{item.category}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="mobile-no-results">
                  No tools found matching &quot;{mobileSearch}&quot;
                </div>
              )}
            </div>
          ) : (
            /* Full Categorized Lists in Mobile Drawer */
            mobileColumns.map((col, idx) => (
              <div key={idx} className="mobile-category-block">
                <div className="mobile-category-title">{col.title}</div>
                <div className="mobile-tools-list">
                  {col.items.map((item, itemIdx) => (
                    <Link
                      key={itemIdx}
                      href={`/tools/${col.categorySlug}/${item.slug}`}
                      className="mobile-tool-item"
                      onClick={() => handleToolClick(col.categorySlug)}
                    >
                      <ToolIcon type={item.type} color={item.color} />
                      <span className="mobile-tool-title">{item.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
};

export default Header;
