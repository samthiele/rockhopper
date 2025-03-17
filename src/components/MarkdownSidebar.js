import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm'
import './MarkdownSidebar.css';

// fetch and MD file for display
const fetchMarkdown = async (url) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    console.error('Error fetching markdown:', error);
    return '';
  }
};

// Scroll MD to a specific heading
const scrollToHeading = (id) => {
  const element = document.getElementById(id);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

const MarkdownSidebar = ({index, annotations, setAnnotations,
                          scene, renderer, cameraRef, controlsRef}) => {
  const [activeTab, setActiveTab] = useState('Guide'); // visible tab
  const [activeLanguage, setLanguage] = useState(0); // active language
  const [markdown, setMarkdown] = useState(null); // loaded .md files
  const [content, setContent] = useState(''); // md content to draw
  const [editedContent, setEditedContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const markdownRef = useRef(null);
  const textareaRef = useRef(null);
  
  // load md files
  useEffect(() => {
    async function loadMD(){
      const guide = await fetchMarkdown( index.current.guide[activeLanguage] );
      const notes = await fetchMarkdown( index.current.notes[activeLanguage] );
      const extras = await fetchMarkdown( index.current.extras[activeLanguage] );
      const help = await fetchMarkdown( index.current.help[activeLanguage] );
      setMarkdown( { "guide" : guide, "notes" : notes, 
                     "extras" : extras, "help" : help} ) // update MD
      if (activeTab==='Guide') setContent(guide);
      if (activeTab==='Notebook') setContent(notes);
      if (activeTab==='Extras') setContent(extras);
      if (activeTab==='Help') setContent(help);
    }
    loadMD();
    }, [activeLanguage]); // depends on selected language!

    // Scroll to heading if URL contains a hash
    useEffect(() => {
      if (window.location.hash) {
        const id = window.location.hash.substring(1);
        setTimeout(() => scrollToHeading(id), 50); // Delay to ensure content is loaded
      }
    }, [content]);

    // Update markdown based on annotations
    useEffect( () => {
      // TODO 
      // console.log(annotations);
    }, [annotations]);

    // edit functions
    const handleDoubleClick = () => {
      if (!isEditing){
        setEditedContent(content);
        setIsEditing(true);
      }
    };
    const handleKeyDown = (event) => {
      if (event.shiftKey && event.key === 'Enter') {
        setContent(editedContent);
        setIsEditing(false);
      }
    };
    
  if (window.location.hash) {
    const id = window.location.hash.substring(1);
    scrollToHeading(id);
  }

  return (
    <div className="sidebar">
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'Guide' ? 'active' : ''}`}
          onClick={() => {setActiveTab('Guide'); setContent( markdown.guide );}}
        > Guide </button>
        <button
          className={`tab ${activeTab === 'Notebook' ? 'active' : ''}`}
          onClick={() => {setActiveTab('Notebook'); setContent( markdown.notes );}}
        > Notebook </button>
        <button
          className={`tab ${activeTab === 'Extras' ? 'active' : ''}`}
          onClick={() => {setActiveTab('Extras'); setContent( markdown.extras );}}
        > Extras </button>
        <button
          className={`tab ${activeTab === 'Help' ? 'active' : ''}`}
          onClick={() => {setActiveTab('Help'); setContent( markdown.help );}}
        > Help </button>
      </div>

      <div className="content" ref={markdownRef} onDoubleClick={handleDoubleClick}>
      {isEditing ? (
          <textarea className="markdown-editor"
            ref={textareaRef}
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          /> ) : ( <>
          <ReactMarkdown 
            className="markdown"
            remarkPlugins={[remarkGfm]}
            components={{
              h2: ({ node, children }) => {
                // set ID to allow scrolling to heading
                if (children.type === 'a'){
                  let id = children.props.children.toLowerCase().replace(/\s+/g, '');
                  if (id in index.current.siteIndex) id = index.current.siteIndex[id]; // translate possibly
                  const url = children.props.href;
                  return <h2 id={id}><a href={url}>{children}</a></h2>;
                } else {
                  let id = children.toLowerCase().replace(/\s+/g, '');
                  if (id in index.current.siteIndex) id = index.current.siteIndex[id]; // translate possibly
                  return <h2 id={id}>{children}</h2>;
                }
              },
              h3: ({ node, children }) => {
                // set ID to allow scrolling to heading
                if (children.type === 'a'){
                  const id = children.props.children.toLowerCase().replace(/\s+/g, '');
                  const url = children.props.href;
                  return <h3 id={id}><a href={url}>{children}</a></h3>;
                } else {
                  const id = children.toLowerCase().replace(/\s+/g, '');
                  return <h3 id={id}>{children}</h3>;
                }
              },
              img : ({node, children } ) => {
                return (
                  <figure>
                    <img src={node.properties.src} width="100%" />
                    <figcaption><em>{node.properties.alt}</em></figcaption>
                  </figure>
                  );
              }
            }} 
        >
          {content}
        </ReactMarkdown></>)}
      </div>
      <hr/>
      <div className="lbar">
        {Object.entries(index.current.languages).map(([i,v]) => {
          return <button className={`lbutton ${activeLanguage==i?'active':''}`}
                         onClick={() => {setLanguage(i)}}
                         key={i}> {v} </button>
        })}
        <hr width="1" size="100px" />
        <button className="lbutton" 
                onClick={() => {console.log("todo")}}>Add Stop</button>
        <button className="lbutton" 
                onClick={() => {console.log("todo")}}>⬇ Markdown</button>
        <button className="lbutton" 
                onClick={() => {console.log("todo")}}>⬇ Pointcloud</button>
      </div>
    </div>
  );
};

export default MarkdownSidebar;
