import React from 'react'
import {createRoot} from 'react-dom/client'
import {forgetUnneededPictures} from './panels/preset-thumbnails'
import './styles/app.css'
import {App} from './app/App'

const container = document.getElementById('root')

forgetUnneededPictures()

const root = createRoot(container!)

root.render(
    <React.StrictMode>
        <App/>
    </React.StrictMode>
)
