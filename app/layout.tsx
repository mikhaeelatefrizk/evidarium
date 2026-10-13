import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Evidarium — Research you can trace',description:'A private research workspace for evidence, reproducible analysis, and a ChatGPT-powered local companion.',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
