
# Annotations

It is also possible to add links or other html content into the 3D viewer. To do this, use `Cmd+Left click` to select a point in the model or photosphere (a small yellow sphere should appear) and then press `Enter`. Another popup should open asking you to `Enter label (text or html)`. You can add a label here (e.g., "Cool thing here") and it will be rendered in the 3D viewer. More usefully, you can also put ANY html element here (e.g., images, links, etc. ...). 

Most useful are 3D links, which can be used to add navigation elements that appear in the 3D viewer. To do this create a new point (as before), press `Enter` and add the following html in the pop-up window:

```
<a href='./#start'>Back to start</a>
```

A shaded black rectangle should then appear, with a link in it that will take you from e.g., the "markdown" page back to the "start".

----

***Exercise:** Add a 3D links that allow us to navigate between the `markdown`, `annotations`, and `multimedia` pages.*

----

HTML elements containing figures or images can also be useful sometimes; though also have a tendency to be large and dominating (it is normally to put images here in the markdown tabs!). But, if you control the size carefully, images can be inserted as follows:

```
<figure>
<imgsrc=\"https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Heic1311a.jpg/1280px-Heic1311a.jpg\" 
style=\"width: 256px;\"> 
<figcaption>Searching deep space for the penguin and egg galaxy</figcaption>
</figure>
```

It can sometimes also be useful to use images (icons) as links:

```
<a href='./#start'>
<img src="/icon/hopper_64.png" style="width:32px"/>
</a>
```

### Lines and planes

Annotations can also be more than points; if you `Cmd+Left click` more than once then a 3D polyline will be drawn, which can be useful for highlighting some structures or geometries. If a polyline with exactly 3 vertices is defined then it will be displayed as a best-fit plane (disk), which can be useful for geological structures like bedding.

`Double-click` unwanted annotations to delete them. 

----

***Exercise:** Draw an annotation that outlines the milky way.*

----

