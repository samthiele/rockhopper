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

const MarkdownSidebar = ({tour, site, annotations, setAnnotations, three}) => {
  const [activeTab, setActiveTab] = useState('guide'); // visible tab
  const [activeLanguage, setLanguage] = useState(0); // active language
  const [markdown, setMarkdown] = useState(null); // loaded .md files
  const [content, setContent] = useState(''); // md content to draw
  const cache = useRef({}); // md cache to allow edits
  const [editedContent, setEditedContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const markdownRef = useRef(null);
  const textareaRef = useRef(null);
  
  // load md files
  let tabs;
  tabs = {...tour.sites[ site ].tabs, ...tour.tabs};
  let gkeys = Object.keys(tour.tabs); // "global" tabs
  let lkeys = Object.keys(tour.sites[site].tabs); // site-specific tabs
  if (tour.tabs._order) gkeys = tour.tabs._order; // order is specified
  if (tour.sites[site].tabs._order) lkeys = tour.sites[site].tabs._order; // order is specified
  const tabNames = [...lkeys, ...gkeys]; // all keys
  useEffect(() => {
    async function loadMD(){
      const mdown = {...markdown}; // put fetched markdown here
      for (const k of tabNames) {
        console.log(k);
        const url = tabs[k][activeLanguage];
        if (!(url in cache.current)){
          cache.current[url] = await fetchMarkdown( tabs[k][activeLanguage] );
        } 
        mdown[k.toLowerCase()] = {url:url, text:cache.current[url]};
      }
      setMarkdown( mdown ) // update MD
      if (activeTab.toLowerCase() in mdown){
        setContent( mdown[activeTab.toLowerCase()].text );
      } else{
        const t = tabNames[0];
        setContent( mdown[t.toLowerCase()].text );
        setActiveTab(t.toLowerCase());
      }
    }
    loadMD();
    }, [site, activeLanguage]); // depends on selected language!

    // Scroll to heading if URL contains a hash
    const params = useParams();
    useEffect(() => {
      if (window.location.hash) {
        const id = params.site.toLowerCase();
        //const id = window.location.hash.substring(1);
        setTimeout(() => scrollToHeading(id), 50); // Delay to ensure content is loaded
      }
    }, [content, params]);

    // edit functions
    const handleDoubleClick = () => {
      if (tour.devURL || activeTab.toLowerCase()==='notebook'){ // editing only for notes or in dev mode
        if (!isEditing){
          setEditedContent(content);
          setIsEditing(true);
        }
      }
    };
    const handleKeyDown = (event) => {
      if (event.shiftKey && event.key === 'Enter') {
        markdown[activeTab].text = editedContent; // update markdown text
        cache.current[markdown[activeTab].url] = editedContent; // also update cache
        setMarkdown({...markdown}); // update "stored" markdown 
        setContent(editedContent); // update displayed content
        setIsEditing(false); // no longer editing

        // update .md file if dev server is running?
        if (tour.devURL){
          // send a POST that updates markdown file
          fetch("./update", {
            method : 'POST', 
            headers : { 'Content-Type':'application/json; charset=utf-8'},
            body: JSON.stringify(
              {filename: markdown[activeTab].url,
               content: editedContent,
               dtype: 'application/text'
              })
          }).then( (response) => {if (response.status!=200) console.log(`Error saving file ${markdown[activeTab].url}`)});  
        }
      }
    };
    
  if (window.location.hash) {
    const id = window.location.hash.substring(1);
    scrollToHeading(id);
  }
  return (
    <div className="sidebar">
      <div className="tabs">
        { tabNames.map( (k) => {
          return <button
            className={`tab ${activeTab.toLowerCase() === k.toLowerCase() ? 'active' : ''}`}
            onClick={() => {setActiveTab(k.toLowerCase()); setContent( markdown[k.toLowerCase()].text );}}
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
              p: props => <div {...props} className='markdownParagraph'/>,
              h2: ({ node, children }) => { // set ID to allow scrolling to heading
                if (children.type === 'a'){
                  let id = children.props.children.toLowerCase().replace(/\s+/g, '');
                  if (id in tour.synonyms) id = tour.synonyms[id]; // translate possibly
                  const url = children.props.href;
                  return <h2 id={id}><a href={url}>{children}</a></h2>;
                } else {
                  let id = children.toLowerCase().replace(/\s+/g, '');
                  if (id in tour.synonyms) id = tour.synonyms[id]; // translate possibly
                  return <h2 id={id}>{children}</h2>;
                }
              },
              h3: ({ node, children }) => { // set ID to allow scrolling to heading
                if (children.type === 'a'){
                  let id = children.props.children.toLowerCase().replace(/\s+/g, '');
                  if (id in tour.synonyms) id = tour.synonyms[id]; // translate possibly
                  const url = children.props.href;
                  return <h2 id={id}><a href={url}>{children}</a></h2>;
                } else {
                  let id = children.toLowerCase().replace(/\s+/g, '');
                  if (id in tour.synonyms) id = tour.synonyms[id]; // translate possibly
                  return <h2 id={id}>{children}</h2>;
                }
              },
              img : ({node, children } ) => { // set size and add alt-text as figure caption
                return (
                  <figure style={{textAlign:"center"}} >
                    <img src={node.properties.src} style={{maxWidth:"100%"}} />
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
                // unwrap blockquote command
                const unwrap = ( cmd ) => {
                  if (Array.isArray(cmd)){
                    return cmd.map( (el) => {
                      if (el.props){
                        return unwrap(el.props.children); // React element
                      } else {
                        return el.trim(); // string
                      }
                    }).join(' ');
                  } else {
                    return cmd.trim();
                  }
                }
                const command = unwrap( children[1].props.children );
                const parts = command.split(' ');

                // audio?
                if (parts[0] === 'audio' && (parts.length == 2)) {
                  const srcUrl = parts[1].trim();
                  return (
                    <div>
                      <audio controls style={{width: "100%"}}>
                        <source src={srcUrl} type="audio/mpeg"/>
                        Your browser does not support the audio element.
                      </audio>
                    </div>
                  );
                }
                // youtube video
                if (parts[0] === 'youtube' && (parts.length) == 2){
                  const srcUrl = parts[1].trim();
                  return (
                    <div>
                      <iframe style={{width:"100%", height:"315px", paddingTop: "1em" }} 
                      src={srcUrl} title="Video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen;" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
                    </div>
                  );
                }
                // stereonet? [ todo ]
                
                // not a command; return a normal block quote
                return <blockquote>{children}</blockquote>
              }
            }} 
        >
          {content + (annotations && (activeTab.toLowerCase()==='notebook')?annotToMD(annotations[site]):"")}
        </ReactMarkdown></>)}
      </div>
      <div className="lbar">
        {Object.entries(tour.languages).map(([i,v]) => {
          return <button className={`lbutton ${activeLanguage==i?'active':''}`}
                         onClick={() => {setLanguage(i)}}
                         key={i}> {v} </button>
        })}
        -
        {tour.devURL ? (
          <button className="lbutton" onClick={() => {
                  // get view
                  const v = {...tour.sites[site].view} || {};
                  v.pos = [three.current.camera.position.x, 
                            three.current.camera.position.y, 
                            three.current.camera.position.z];
                  v.tgt = [three.current.controls.target.x, 
                            three.current.controls.target.y, 
                            three.current.controls.target.z];
                  
                  // get site to update
                  let txt = prompt("Enter new site name (or nothing to update current site)").trim().toLowerCase();
                  let sname = site;
                  if (txt !== ''){
                    sname = txt
                    if (!(sname in tour.sites)){
                      // create a new site, based on the current one
                      tour.sites[sname] = {...tour.sites[site]} // duplicate :-) 
                      tour.synonyms[sname] = sname; // don't forget this!
                    }
                    window.location.hash = `#/${sname}`; // update hash
                  }
                  
                  // make update
                  tour.sites[sname].view = v;
                  
                  // send a POST that updates JSON file
                  fetch("./update", {
                    method : 'POST', 
                    headers : { 'Content-Type':'application/json; charset=utf-8'},
                    body: JSON.stringify(
                      {filename: "./index.json",
                       content: JSON.stringify(tour, null, 2),
                       dtype: 'application/json'
                      })
                  }).then((response) => {if (response.status!=200) console.log(`Error saving index.json`)});   
                }}> Save View </button>) : (<></>) }

        <button className="lbutton" onClick={() => {
              // Create a Blob from the markdown content
              const blob = new Blob([content], { type: 'text/markdown' });
              const url = URL.createObjectURL(blob); // Create a URL for the Blob

              // Create a temporary anchor element to trigger the download
              const a = document.createElement('a');
              a.href = url;
              a.download = 'notes.md'; // Set the file name
              document.body.appendChild(a); // Append the anchor to the body
              a.click(); // Programmatically click the anchor to start the download
              document.body.removeChild(a); // Remove the anchor from the body

              // Revoke the object URL to free up memory
              URL.revokeObjectURL(url);
          }} > Notes ⬇ </button>
          <input type="file" accept=".md" onChange={(event) => {
                  const file = event.target.files[0]; // Get the uploaded file
                  if (file) {
                      const reader = new FileReader();
                      reader.onload = (e) => {
                          const markdownContent = e.target.result; // Get the file content as text
                          const url = tabs['Notebook'][activeLanguage];
                          cache.current[url] = markdownContent; // update cached md file
                          setMarkdown({...markdown, notebook:{text: markdownContent}});
                          setActiveTab('Notebook');
                          setContent(markdownContent);
                      };
                      reader.readAsText(file); // Read the file as text
                  }
              }}
              style={{ display: 'none' }} // Hide the file input
              id="upload-markdown"/>
          <button className="lbutton" onClick={() => { document.getElementById('upload-markdown').click(); }} >
              ⬆
          </button>

      </div>
    </div>
  );
};

export default MarkdownSidebar;
