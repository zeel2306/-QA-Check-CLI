import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { scenario } from './scenario';
import './style.css';
const products = [{ id: 1, name: 'Travel Bag' }, { id: 2, name: 'Desk Lamp' }];
function Home() {
  React.useEffect(() => {
    if (scenario.consoleError) console.error('LAB11 intentional runtime console error');
    if (scenario.networkError) fetch('/__lab11/intentional-failure.json').catch(() => {});
  }, []);
  return <main><h1>QA Check Lab 11</h1><p>A small storefront for release-gate testing.</p><img src={scenario.brokenImage ? '/missing-banner.png' : '/logo.svg'} alt="Lab 11 brand" /><p><Link to={scenario.brokenLink ? '/broken-page' : '/products'}>Explore products</Link></p></main>;
}
function Products() { return <main><h1>Products</h1>{products.map(p => <article key={p.id}><h2>{p.name}</h2><p>Product #{p.id}</p></article>)}</main>; }
function Contact() { return <main><h1>Contact</h1><form onSubmit={e => e.preventDefault()}><label htmlFor="email">Email</label><input id="email" type="email" placeholder="you@example.com" />{scenario.missingLabel && <input placeholder="Phone number" />}<button type="submit">Send</button></form></main>; }
function NotFound() { return <main><h1>Page not found</h1><Link to="/">Go home</Link></main>; }
function App() { return <><header><nav><Link to="/">Home</Link><Link to="/products">Products</Link><Link to="/contact">Contact</Link></nav></header><Routes><Route path="/" element={<Home/>}/><Route path="/products" element={<Products/>}/><Route path="/contact" element={<Contact/>}/><Route path="*" element={<NotFound/>}/></Routes></>; }
createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><App/></BrowserRouter></React.StrictMode>);
