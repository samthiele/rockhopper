from setuptools import setup

setup(
    name='rockhopper',
    version='0.01',
    packages=['rockhopper'],
    url='',
    license='',
    author='Sam Thiele',
    author_email='s.thiele@hzdr.de',
    description='A python package for building virtual field trips.',
    include_package_data=True,
    install_requires=['numpy', 'tqdm', 'zarr', 'numcodecs', 
                      'scikit-learn', 'scipy', 'flask', 'plyfile'],
    package_data = {"":["*.html",
                        "*.css","*.css.map","*.md",
                        "*.js","*.js.map","*.com",
                        "*.png","*.json","*.txt"]}
)