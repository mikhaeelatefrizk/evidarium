import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Evidarium — Research workspace',description:'A private workspace for original evidence, independent review, reproducible analysis, and research writing.',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
