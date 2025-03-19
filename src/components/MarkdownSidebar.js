import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
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

const annotToMD = (annotations) => {
  let text = "\n";
  const bearing = {minimumIntegerDigits:3, useGrouping:false, maximumFractionDigits:0};
  const dip = {minimumIntegerDigits:2, useGrouping:false, maximumFractionDigits:0};
  const length = {useGrouping:false, maximumFractionDigits:2};
  if (annotations.planes.length > 0){
    text = text + "## Planes\n";
    text = text + " | strike | dip | dipdir | \n";
    text = text + " |--------|-----|--------| \n";
    annotations.planes.forEach( (p) => {
    text = text + '|'+p.strike.toLocaleString('en-US', bearing);
    text = text + '|'+p.dip.toLocaleString('en-US', bearing);
    text = text + '|'+p.dipdir.toLocaleString('en-US', bearing);
    text = text + '|\n';
    });
  }
  if (annotations.lines.length > 0){
    text = text + "## Lines\n";
    text = text + " | trend | plunge | length | \n";
    text = text + " |-------|--------|--------| \n";
    annotations.lines.forEach( (l) => {
        text = text + '|'+l.trend.toLocaleString('en-US', bearing);
        text = text + '|'+l.plunge.toLocaleString('en-US', dip);
        text = text + '|'+l.length.toLocaleString('en-US', length);
        text = text + ' |\n';
    });
  }
  return text;
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
  const [activeTab, setActiveTab] = useState('guide'); // visible tab
  const [activeLanguage, setLanguage] = useState(0); // active language
  const [markdown, setMarkdown] = useState(null); // loaded .md files
  const currentSite = useState('start');
  const [content, setContent] = useState(''); // md content to draw
  const [editedContent, setEditedContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const markdownRef = useRef(null);
  const textareaRef = useRef(null);
  
  // load md files
  let tabs;
  const params = useParams();
  if (params.site in index.current.synonyms){
    tabs = {...index.current.sites[ index.current.synonyms[params.site] ].tabs, ...index.current.tabs};
    currentSite.current = index.current.synonyms[params.site];
  } else if (currentSite.current) {
    tabs = {...index.current.sites[ index.current.synonyms[currentSite.current] ].tabs, ...index.current.tabs};
  } else {
    tabs = {...index.current.tabs};
  }
  useEffect(() => {
    async function loadMD(){
      const mdown = {...markdown}; // put fetched markdown here
      for (const k of Object.keys(tabs)) {
        // notes are special -- we only load those once
        if (!(k.toLowerCase()==="notebook" && "notebook" in mdown)){ 
          // otherwise, fetch away!
          mdown[k.toLowerCase()] = await fetchMarkdown( tabs[k][activeLanguage] );
        }
      }
      setMarkdown( mdown ) // update MD
      if (activeTab.toLowerCase() in mdown){
        setContent( mdown[activeTab.toLowerCase()] );
      } else{
        const t = Object.keys(index.current.tabs)[0];
        setContent( mdown[t.toLowerCase()] );
        setActiveTab(t.toLowerCase());
      }
    }
    loadMD();
    }, [params, activeLanguage]); // depends on selected language!

    // Scroll to heading if URL contains a hash
    useEffect(() => {
      if (window.location.hash) {
        const id = window.location.hash.substring(1);
        setTimeout(() => scrollToHeading(id), 50); // Delay to ensure content is loaded
      }
    }, [content]);

    // edit functions
    const handleDoubleClick = () => {
      if (!isEditing){
        setEditedContent(content);
        setIsEditing(true);
      }
    };
    const handleKeyDown = (event) => {
      if (event.shiftKey && event.key === 'Enter') {
        markdown[activeTab] = editedContent;
        setMarkdown({...markdown}); // update "stored" markdown 
        setContent(editedContent); // update displayed content
        setIsEditing(false); // no longer editing
      }
    };
    
  if (window.location.hash) {
    const id = window.location.hash.substring(1);
    scrollToHeading(id);
  }
  return (
    <div className="sidebar">
      <div className="tabs">
        { Object.keys(tabs).map( (k) => {
          return <button
            className={`tab ${activeTab.toLowerCase() === k.toLowerCase() ? 'active' : ''}`}
            onClick={() => {setActiveTab(k.toLowerCase()); setContent( markdown[k.toLowerCase()] );}}
            key={k}
          > {k} </button>
        }) }
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
              p: props => <div {...props} />,
              h2: ({ node, children }) => { // set ID to allow scrolling to heading
                if (children.type === 'a'){
                  let id = children.props.children.toLowerCase().replace(/\s+/g, '');
                  if (id in index.current.synonyms) id = index.current.synonyms[id]; // translate possibly
                  const url = children.props.href;
                  return <h2 id={id}><a href={url}>{children}</a></h2>;
                } else {
                  let id = children.toLowerCase().replace(/\s+/g, '');
                  if (id in index.current.synonyms) id = index.current.synonyms[id]; // translate possibly
                  return <h2 id={id}>{children}</h2>;
                }
              },
              h3: ({ node, children }) => { // set ID to allow scrolling to heading
                if (children.type === 'a'){
                  let id = children.props.children.toLowerCase().replace(/\s+/g, '');
                  if (id in index.current.synonyms) id = index.current.synonyms[id]; // translate possibly
                  const url = children.props.href;
                  return <h2 id={id}><a href={url}>{children}</a></h2>;
                } else {
                  let id = children.toLowerCase().replace(/\s+/g, '');
                  if (id in index.current.synonyms) id = index.current.synonyms[id]; // translate possibly
                  return <h2 id={id}>{children}</h2>;
                }
              },
              img : ({node, children } ) => { // set size and add alt-text as figure caption
                return (
                  <figure>
                    <img src={node.properties.src} width="100%" />
                    <figcaption><em>{node.properties.alt}</em></figcaption>
                  </figure>
                  );
              },
              li :({node, children}) => { //node.children[0].disabled = false;
                if (node.children[0].type === 'element'){
                  if (node.children[0].properties.type === 'checkbox'){
                    const answer = node.children[0].properties.checked;
                    return <li className="question">
                            <input type="checkbox" onClick={(e)=>{
                              e.target.checked = true;
                              e.target.className = answer ? "correct" : "incorrect";
                            }}/>
                            {children.slice(1)}
                           </li>
                  }
                }
                return <li>{children}</li>;
              },
              blockquote : ({node, children}) => {
                // todo -- implement "custom" markdown components here!
                // (e.g., stereonets)
                const command = children[1].props.children;
                console.log(command);
                return <blockquote>{children}</blockquote>
              }
            }} 
        >
          {content + ((activeTab.toLowerCase()==='notebook')?annotToMD(annotations):"")}
        </ReactMarkdown></>)}
      </div>
      <div className="lbar">
        {Object.entries(index.current.languages).map(([i,v]) => {
          return <button className={`lbutton ${activeLanguage==i?'active':''}`}
                         onClick={() => {setLanguage(i)}}
                         key={i}> {v} </button>
        })}
        -
        <button className="lbutton" 
                onClick={() => {console.log("todo")}}>Add Stop</button>
        <button className="lbutton" 
                onClick={() => {console.log("todo")}}>⬇ MD</button>
        <button className="lbutton" 
                onClick={() => {console.log("todo")}}>⬇ Cloud</button>
      </div>
    </div>
  );
};

export default MarkdownSidebar;
