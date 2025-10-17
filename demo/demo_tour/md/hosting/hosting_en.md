
# Hosting

Once you have finished creating a VFT you'll likely want to host it publicly, so that people can access and enjoy it. 

Depending on the size of your point cloud datasets, and access to a web infrastructure (e.g., from your university or institution), there are several ways to do this. 


## Self-hosted web server 

If you have access to a web-server then this can be done in three easy steps:

1.  Upload the directories containing your point clouds (i.e., [`demo_cloud`](https://github.com/samthiele/rockhopper/tree/main/demo/demo_clouds)) to an accessible web server.

2. Update the `cloudURL` key of your `index.json` file so that it points to these uploaded clouds (e.g., for this demo tour this is `https://samthiele.github.io/rockhopper/demo_clouds`)

3. Upload the directories containing your VFT files (i.e., [`demo_vft`](https://github.com/samthiele/rockhopper/tree/main/demo/demo_tour)), including the updated `index.json` file, to the same web server.

The tour should then be public. If there are issues streaming the point clouds, try accessing the `.zattrs` files (noting that these "hidden" files sometimes need to be explicitly pushed to GitHub). A small JSON file should download when you put in the point cloud URL, e.g., for this site: 

[https://samthiele.github.io/rockhopper/demo_clouds/Penguin.zarr/.zattrs](https://samthiele.github.io/rockhopper/demo_clouds/Penguin.zarr/.zattrs) 

If the .zattrs files successfully download, your point cloud should be accessible. In case of issues, check the hidden files (starting with a . ) have been correctly uploaded, and check the [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS) settings allows access to them from external domains.

## Hosting on GitHub Pages

If you don't have a web server, a good option for web hosting is [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

Create a new repository containing your VFT directories ([`demo_vft`](https://github.com/samthiele/rockhopper/tree/main/demo/demo_tour)) and point cloud directory (i.e., [`demo_cloud`](https://github.com/samthiele/rockhopper/tree/main/demo/demo_clouds)) and then follow the tutorial [here](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) to enable GitHub pages. 

Once the pages site is setup, update the `index.json` file to point to the appropriate GitHub pages URL:

e.g., `https://samthiele.github.io/rockhopper/demo_clouds`

and push the changes. Check that the [.zattr](https://samthiele.github.io/rockhopper/demo_clouds/Penguin.zarr/.zattrs) file is accessible, as described in the previous section. If that works your VFT should then be fully functional at a URL similar to:

[https://samthiele.github.io/rockhopper/demo_tour/index.html](https://samthiele.github.io/rockhopper/demo_tour/index.html).

**Note that this is only a viable option if the point cloud data in your VFT are quite small (<500 Mb) after converting to the zarr format.**

## Split hosting

If your point clouds are (in total) larger than a few hundred Mb, as is often the case for larger VFTs, you will need a dedicated cloud storage space. 

Many cloud storage options are available, such as [Google Cloud](https://cloud.google.com/storage?hl=en). These cost a small amount every time someone accesses the data (views the tour), though unless you make something really viral, this is normally less than a few cents per month (many thousands of downloads).

Once you upload the directory containing your point cloud zarr data to such a platform (and give the appropriate CORS access permissions!) then you should be able to update the `cloudURL` key in your `index.json` file and Bob's your uncle! It is even possible (even recommended!) to host point cloud data on a static web server and the tour itself on a GitHub pages site (see previous section) to allow version tracking, forking, etc.










