from setuptools import setup
from setuptools import find_packages

setup(
    name='rockhopper',
    version='0.1',
    packages=find_packages(include=['rockhopper', 'rockhopper.*']),
    url='',
    license='',
    author='Sam Thiele',
    author_email='s.thiele@hzdr.de',
    description='A python package for building virtual field trips.',
    include_package_data=True,
    install_requires=['numpy', 'tqdm', 'zarr==2.18', 'numcodecs==0.15.1', 
                      'scikit-learn', 'scipy', 'flask', 'flask_cors', 'plyfile'],
    package_data = {"":["*.html",
                        "*.css","*.css.map","*.md",
                        "*.js","*.js.map","*.com",
                        "*.png","*.json","*.txt"]}
)