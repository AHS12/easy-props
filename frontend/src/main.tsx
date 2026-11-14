import React from 'react'
import {createRoot} from 'react-dom/client'
import {forgetUnneededPictures} from './panels/preset-thumbnails'
import './styles/app.css'
import {App} from './app/App'
import {connectShell} from './platform/shell'

const container = document.getElementById('root')

forgetUnneededPictures()

// Inside the app, Go and the window are reached once the shell is connected, so
// nothing is drawn before then.
void connectShell().then(() => {
    createRoot(container!).render(
        <React.StrictMode>
            <App/>
        </React.StrictMode>
    )
})
