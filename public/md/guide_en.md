# Introduction

RockHopper is designed to combine media-rich text content with 3D point cloud and photosphere data, to create engaging, interactive and contentful virtual fieldtrips (VFTs). While it is designed with geological fieldtrips (and digital outcrops) in mind, it should be suitable for any content based around 3D point cloud (or photosphere) data.

Unlike many VFT platforms, RockHopper uses point clouds as the core 3D data type. This facilitates flexible (fast) streaming, and the visualisation of multiple attributes or time-slices. Most importantly, almost any content (e.g., maps, orthophotos, globes, volumetric models etc.) can, with a little work in `python` or `CloudCompare` be converted into a consistent point cloud format -- providing lots of versatility.  

# Navigation

This short demo-VFT shows some of the core features of RockHopper. These are discussed in each of three different sites:

- [Site 1](./#site1)
- [Site 2](./#site2)
- [Site 3](./#site3)
- [Site 4](./#site4)


# Markdown

Text content in RockHopper virtual field trips is stored with the easy-to-learn and widely used `Markdown` format. Double-click this text to see what this looks like! (And then press `Shift+Enter` to format the markdown again). A useful guide to writing markdown files can be found [here](https://www.markdownguide.org/cheat-sheet/).

Markdown from different files can be combined to create different tabs in your field trip. By default a trip should at least contain a `Guide`, `Notes` and `Help` tab, though others can be added as needed (e.g., see the `References` tab in this VFT). Importantly, each site in a VFT can also show different markdown content. 

You can see how the tabs are linked to corresponding markdown files in the [`index.json`](./index.json) file. This file also specifies the data sources different sites connect to, and contains information on how they should be displayed, which `Annotations` or `Labels` should be added, and which translation languages are available. 

## Editing Markdown

To edit the markdown in your browser, double-click this text. Once finished,
use `shift+enter` to render the markdown again. If you are using a local development server (see RockHoppers [GitHub](https://github.com/samthiele/rockhopper) page for more details) then these edits will be automatically saved in your virtual tour. 

Once a tour is live (hosted by a static web server) changes can be disabled for all except the `Notes` tab. Changes in the `Notes` can be downloaded using the `⬇ MD` button in the bottom left.

## Fancy markdown

Markdown text can be long and detailed, and translated into several languages (see buttons on the bottom left). It can also contain various media, including pictures.

![Don't let markdown get you down!](https://upload.wikimedia.org/wikipedia/commons/7/7b/ZSL_London_-_Northern_rockhopper_penguin_%2801%29.jpg)

Tables can also be used:

*Table 1: A small collection of fun facts.*

| **About Rock Hopper Penguins**  |          |
|----------|----------|
| Common Name | rockhopper penguin   |
| Fancy Name (Northern) | Eudyptes moseleyi   |
| Fancy Name (Southern) | Eudyptes chrysocome   |
| Rapper Name | Hop the Rocker   |
| Size | 41 to 46 cm   |
| Weight | 2.5 kg   |
| Diet | fish, squid, krill, tourists  |
| Habitat | Rocks, Water   |

As can multiple-guess questions, to keep your students on their toes!

---

Are penguins punks?
- [x] Yes
- [ ] No
- [ ] Sometimes

---

For more extensive tours, audio can be created and embedded (or linked from other sources) - do you think RockHoppers can sing?

> audio https://xeno-canto.org/sounds/uploaded/YYMEPEMBFR/XC952603-S_Rock_Hop_West_Pt_Falkland_Is.mp3

Including YouTube videos can also help explain content in an engaging way.

> youtube https://www.youtube.com/embed/lVD1WaMaqDc?si=jXZzNdHYJXJSLbYg

## Linking to headings and sites

The hash part of the URL (the bit following the # character) can be used to create internal links, such that markdown links can be used to navigate within and between different sites in a virtual fieldtrip.  

[Go to Stop 1](./#site1)
[Go to Stop 2](./#site2)
[Go to Photosphere](./#photosphere)

Assuming these sites are registered in the tour's `index.json` file, then corresponding changes in the viewer (camera position, render style, point visibility etc.) will be applied on clicking the link.

Headings that have the same name as a site (ignoring spaces and upper/lower case) will also be automatically scrolled to when the above links are clicked. This can help match text content with what is being shown on a point cloud or photosphere.

# Tour
A virtual field trip is generally organised into several sites or stops. These can each use independent datasets (e.g., from locations that are a long way apart from each other), or can be defined as different locations or views of a single point cloud or photosphere.

Depending on the size of the tour, all sites can be described in a single markdown file (as is done here), or a different markdown file loaded for each location. The tour's `index.json` file simply needs to specify which markdown file should be loaded for each site.

## [Site 1](./#site1)

Site 1 shows an outcrop where I found some cool pebbles for my collection. I've used the "highlight" tools to show the rock unit that these are from. 

![My funky rock collection](https://upload.wikimedia.org/wikipedia/commons/4/41/Pet_rock.jpg)

## [Site 2](./#site2)

This is a different location in the same point cloud, this time showing a fault. I've added some annotations to emphasise the location and orientation of this fault, although this can be toggled on and off using the "annotate" button.

![The flow of penguins through open bedding-parallel and bedding-perpendicular fractures is an exciting and under-explored avenue for future research](https://birdoftheweek.home.blog/wp-content/uploads/2022/01/image.png)

## [Site 3](./#site3)

In addition to point cloud data, RockHopper can be used to visualise
photospheres. These can be useful for building an immersive experience and capturing the atmosphere of a place.  

As with point clouds, annotation layers can be added to photospheres using `Ctrl+Left click` (see the `Help` tab for more details). These can be useful for labelling or highlighting important features.

## [Site 4](./#site4)

Virtual field trips can also include data from all over the world! As an example, 
lets take a quick break and check out La Palma in the Canary Islands.

This also demonstrates how satellite imagery + a DEM (e.g., SRTM) can be used to make nice 3D maps. Such maps can be useful for tying together all the different sites in a VFT.
