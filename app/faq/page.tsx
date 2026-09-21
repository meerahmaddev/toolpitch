'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import '../privacy-policy/LegalPage.css';
import './FAQ.css';

const faqs = [
  {
    question: 'Is Convertify free to use?',
    answer: "Yes. Convertify is completely free — there's no paid or premium tier.",
  },
  {
    question: 'Do I need to create an account?',
    answer:
      'No, not to convert a file — you can use any tool as a guest. An account is only needed if you want to use the Workspace to save, organize, and revisit your files later.',
  },
  {
    question: 'What file types can I convert?',
    answer:
      'Convertify supports PDF, Word (DOC/DOCX), Excel (XLS/XLSX), PowerPoint (PPT/PPTX), common image formats (JPG, PNG, WEBP, HEIC, SVG), and audio (for Text-to-Speech / Speech-to-Text) — 20+ tools in total across PDF, Image, Editor, and Voice categories.',
  },
  {
    question: 'What are the file size limits?',
    answer:
      'Per file: PDFs up to 10MB, images up to 5MB, and audio up to 5MB. For converting or downloading multiple files at once (batch), the combined total is capped at 10MB.',
  },
  {
    question: 'How long are my files kept?',
    answer:
      "Files — both uploaded and converted — are automatically and permanently deleted after 24 hours. This applies whether you're logged in or using Convertify as a guest.",
  },
  {
    question: 'Is my data secure?',
    answer:
      'Files are stored with authenticated, non-public access and are only ever served through short-lived signed URLs, not permanent public links.',
  },
  {
    question: 'Can I convert multiple files at once?',
    answer:
      'For tools like Merge PDF and Images to PDF, you can upload and combine multiple files at once. For standard conversions (like Word to PDF, JPG to PNG), files are converted one at a time to ensure maximum speed and stability.',
  },
  {
    question: 'Can I download multiple files from my Workspace at once?',
    answer: 'Yes — select multiple files in your Workspace and download them together as a single zip (up to 10MB total per download).',
  },
  {
    question: 'Can I import files from Google Drive or a URL?',
    answer: 'Yes, both are supported — you can pick a file from Google Drive or paste a direct file URL instead of uploading from your device.',
  },
  {
    question: 'Is there a paid or premium plan?',
    answer: 'No — Convertify is entirely free with no premium tier or upgrade option.',
  },
  {
    question: 'Is there a public API for developers?',
    answer: "Not currently — there's no public/developer API available today.",
  },
  {
    question: 'What happens to my file if I use Convertify without an account?',
    answer:
      "It still works, but the file exists only for the 24-hour retention window and isn't saved to any Workspace (since that requires an account) — so make sure to download it before it expires.",
  },
];

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="legal-page-container">
      <div className="legal-header">
        <h1>Frequently Asked Questions</h1>
        <p>Everything you need to know about using Convertify.</p>
      </div>

      <div className="faq-list">
        {faqs.map((faq, index) => {
          const isOpen = openIndex === index;
          return (
            <div key={index} className={`faq-item ${isOpen ? 'open' : ''}`}>
              <button
                type="button"
                className="faq-question"
                onClick={() => {
                  window.soundManager?.playClick();
                  setOpenIndex(isOpen ? null : index);
                }}
                aria-expanded={isOpen}
              >
                <span>{faq.question}</span>
                <ChevronDown size={18} className="faq-question-icon" />
              </button>
              <div className="faq-answer-wrapper">
                <div className="faq-answer-inner">
                  <p className="faq-answer">{faq.answer}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
