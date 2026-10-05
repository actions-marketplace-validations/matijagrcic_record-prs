import type * as React from 'react'
import { GalleryVerticalEnd, LayoutDashboard, FolderKanban, LogIn, UserPlus, FilePen } from 'lucide-react'
import { NavUser } from '@/components/nav-user'
import { TeamSwitcher } from '@/components/team-switcher'
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar'

const navigation = [
  {title: 'Overview', path: '/', icon: LayoutDashboard, id: 'overview'},
  {title: 'Projects', path: '/projects', icon: FolderKanban, id: 'projects'},
  {title: 'Sign document', path: '/sign-document', icon: FilePen, id: 'sign-document'},
]

// Adapted from the official shadcn sidebar-07 block.
export function AppSidebar({route, ...props}: React.ComponentProps<typeof Sidebar> & {route: string}) {
  return <Sidebar collapsible="icon" {...props}>
    <SidebarHeader><TeamSwitcher teams={[{name:'Acme Studio', logo:<GalleryVerticalEnd/>, plan:'Demo workspace'}]}/></SidebarHeader>
    <SidebarContent>
      <SidebarGroup><SidebarGroupLabel>Workspace</SidebarGroupLabel><SidebarMenu>
        {navigation.map(item => <SidebarMenuItem key={item.id}><SidebarMenuButton asChild isActive={route === item.path} tooltip={item.title}>
          <a href={`#${item.path}`} data-testid={`nav-${item.id}`}><item.icon/><span>{item.title}</span></a>
        </SidebarMenuButton></SidebarMenuItem>)}
      </SidebarMenu></SidebarGroup>
      <SidebarGroup><SidebarGroupLabel>Account</SidebarGroupLabel><SidebarMenu>
        <SidebarMenuItem><SidebarMenuButton asChild tooltip="Log in"><a href="#/login" data-testid="nav-login"><LogIn/><span>Log in</span></a></SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton asChild tooltip="Sign up"><a href="#/signup" data-testid="nav-signup"><UserPlus/><span>Sign up</span></a></SidebarMenuButton></SidebarMenuItem>
      </SidebarMenu></SidebarGroup>
    </SidebarContent>
    <SidebarFooter><NavUser user={{name:'Demo reviewer', email:'reviewer@example.com', avatar:'/avatar.svg'}}/></SidebarFooter>
    <SidebarRail/>
  </Sidebar>
}
