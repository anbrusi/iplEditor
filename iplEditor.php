<?php
class iplEditor {
    private $langid;
    function __construct(string $langid) {
        $this->langid = $langid;
    }
    private function head():string {
        $html = '';
        $html .= '<head>';
        $html .= '<meta charset="utf-8>';
        $html .= '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
        $html .= '<link rel="stylesheet" type="text/css" href="iplEditor.css">';
        $html .= '<script src="node_modules/@ckeditor/ckeditor5-build-inline/build/ckeditor.js"></script>';
        // $html .= '<script src="https://cdn.ckeditor.com/ckeditor5/31.0.0/inline/ckeditor.js"></script>';
        $html .= '<meta title="iplEditor">';
        $html .= '</head>';
        return $html;
    }
    private function body():string {
        $html = '';
        $html .= '<body>';
        $html .= '<main>';
        $html .= '<h1>iplEditor</h1>';
        $html .= '<div id="iplTest" class="iplTest"></div>';
        $html .= '<script async type="module">';
        $html .= 'import {createIplEditor} from "./iplEditor.js"; ';
        $html .= 'createIplEditor("iplTest")';
        $html .= '</script>';
        $html .= '</main>';
        $html .= '</body>';
        return $html;
    }
    public function dispatch() {
        $html = '<!DOCTYPE html>';
        $html .= '<html lang='.$this->langid.'>';
        $html .= $this->head();
        $html .= $this->body();
        $html .= '</html>';
        echo $html;;
    }
}
$iplEditor = new iplEditor('en');
$iplEditor->dispatch();